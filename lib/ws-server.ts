import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { verifyJwt, parseCookies } from "./auth";
import { getInstanceManager } from "./instance-manager";
import type { ClientMessage } from "./types";

interface RateLimiter {
  tokens: number;
  lastRefill: number;
}

const MAX_MESSAGES_PER_SEC = 10;
const RATE_EXEMPT_TYPES = new Set(["approve_permission", "deny_permission"]);

export class HubWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private rateLimiters = new Map<WebSocket, RateLimiter>();

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupInstanceManagerEvents();
  }

  async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // Validate JWT from cookie BEFORE accepting upgrade
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies.hub_session;

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const user = await verifyJwt(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.onConnection(ws);
    });
  }

  private onConnection(ws: WebSocket): void {
    this.clients.add(ws);
    this.rateLimiters.set(ws, { tokens: MAX_MESSAGES_PER_SEC, lastRefill: Date.now() });

    console.log(`[WS] Client connected (${this.clients.size} total)`);

    ws.on("message", (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.handleClientMessage(ws, msg);
      } catch (err) {
        this.sendTo(ws, {
          type: "error",
          instanceId: "",
          error: "Invalid message format",
        });
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      this.rateLimiters.delete(ws);
      console.log(`[WS] Client disconnected (${this.clients.size} total)`);
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err.message);
      this.clients.delete(ws);
      this.rateLimiters.delete(ws);
    });
  }

  private checkRateLimit(ws: WebSocket, msgType: string): boolean {
    if (RATE_EXEMPT_TYPES.has(msgType)) return true;

    const limiter = this.rateLimiters.get(ws);
    if (!limiter) return false;

    const now = Date.now();
    const elapsed = (now - limiter.lastRefill) / 1000;
    limiter.tokens = Math.min(MAX_MESSAGES_PER_SEC, limiter.tokens + elapsed * MAX_MESSAGES_PER_SEC);
    limiter.lastRefill = now;

    if (limiter.tokens < 1) {
      this.sendTo(ws, {
        type: "error",
        instanceId: "",
        error: "Too many messages — rate limited",
      });
      return false;
    }

    limiter.tokens--;
    return true;
  }

  private async handleClientMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    if (!this.checkRateLimit(ws, msg.type)) return;

    const manager = getInstanceManager();

    switch (msg.type) {
      case "send_message":
        if (!msg.instanceId || !msg.text) {
          this.sendTo(ws, {
            type: "error",
            instanceId: (msg as any).instanceId || "",
            error: "Missing instanceId or text",
          });
          return;
        }
        manager.sendMessage(msg.instanceId, msg.text).catch((err: any) => {
          console.error("[WS] sendMessage error:", err);
        });
        break;

      case "interrupt":
        if (msg.instanceId) {
          const interrupted = await manager.interrupt(msg.instanceId);
          if (!interrupted) {
            this.sendTo(ws, {
              type: "error",
              instanceId: msg.instanceId,
              error: "Instance is not running",
            });
          }
        }
        break;

      case "approve_permission":
        if (msg.instanceId && msg.permissionId) {
          const resolved = manager.resolvePermission(msg.permissionId, true);
          if (!resolved) {
            this.sendTo(ws, {
              type: "error",
              instanceId: msg.instanceId,
              error: "Permission request not found or already resolved",
            });
          }
        }
        break;

      case "deny_permission":
        if (msg.instanceId && msg.permissionId) {
          const resolved = manager.resolvePermission(msg.permissionId, false);
          if (!resolved) {
            this.sendTo(ws, {
              type: "error",
              instanceId: msg.instanceId,
              error: "Permission request not found or already resolved",
            });
          }
        }
        break;

      case "sync_state": {
        const states = await manager.getInstanceStates();
        this.sendTo(ws, {
          type: "sync_state",
          instances: states,
        });
        break;
      }

      default:
        this.sendTo(ws, {
          type: "error",
          instanceId: "",
          error: "Unknown message type",
        });
    }
  }

  private setupInstanceManagerEvents(): void {
    const manager = getInstanceManager();

    manager.on("text_delta", (instanceId: string, delta: string) => {
      this.broadcast({
        type: "text_delta",
        instanceId,
        payload: { delta },
      });
    });

    manager.on("tool_start", (instanceId: string, data: any) => {
      this.broadcast({
        type: "tool_start",
        instanceId,
        payload: data,
      });
    });

    manager.on("status_change", (instanceId: string, status: string, error?: string) => {
      this.broadcast({
        type: "status_change",
        instanceId,
        payload: { status, error },
      });
    });

    manager.on("permission_request", (instanceId: string, data: any) => {
      this.broadcast({
        type: "permission_request",
        instanceId,
        payload: data,
      });
    });

    manager.on("message_done", (instanceId: string, data: any) => {
      this.broadcast({
        type: "message_done",
        instanceId,
        payload: data,
      });
    });

    manager.on("queue_position", (instanceId: string, position: number) => {
      this.broadcast({
        type: "queue_position",
        instanceId,
        payload: { position },
      });
    });

    manager.on("error", (instanceId: string, data: any) => {
      this.broadcast({
        type: "error",
        instanceId,
        payload: data,
      });
    });
  }

  private sendTo(ws: WebSocket, msg: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: any): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  async shutdown(): Promise<void> {
    for (const client of this.clients) {
      client.close(1001, "Server shutting down");
    }
    this.clients.clear();
    this.wss.close();
  }
}

let wsServer: HubWebSocketServer | null = null;

export function getWsServer(): HubWebSocketServer {
  if (!wsServer) {
    wsServer = new HubWebSocketServer();
  }
  return wsServer;
}
