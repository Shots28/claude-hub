// ---------------------------------------------------------------------------
// Claude Hub — Custom HTTP + WebSocket Server
// Run with: tsx server.ts (dev) or tsx server.ts (prod with NODE_ENV=production)
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { parse } from "url";
import { WebSocketServer, type WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3100", 10);

// ---------------------------------------------------------------------------
// Next.js app
// ---------------------------------------------------------------------------

const app = next({ dev });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Cookie parser — splits on FIRST "=" only so base64 values aren't corrupted
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

// ---------------------------------------------------------------------------
// JWT validation — lightweight check using jose
// ---------------------------------------------------------------------------

async function validateJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[ws] JWT_SECRET is not configured");
      return null;
    }

    // Dynamic import to keep top-level synchronous
    const { jwtVerify } = await import("jose");
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret));

    if (typeof payload.sub !== "string" || !payload.sub) {
      return null;
    }

    return { sub: payload.sub };
  } catch (err) {
    console.error("[ws] JWT validation failed:", (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract token from request — checks Authorization header, then cookies
// ---------------------------------------------------------------------------

function extractToken(req: IncomingMessage): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // 2. Cookie: token=<jwt>
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies.token) return cookies.token;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.prepare().then(() => {
  // -- HTTP server ----------------------------------------------------------

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  // -- WebSocket server (no auto-attach — we handle upgrade manually) -------

  const wss = new WebSocketServer({ noServer: true });

  // -- Upgrade handler: authenticate BEFORE accepting the connection --------

  server.on("upgrade", async (req, socket, head) => {
    const { pathname } = parse(req.url || "/", true);

    // Only accept WebSocket upgrades on /ws
    if (pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Validate JWT before upgrading
    const token = extractToken(req);
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nMissing auth token\n");
      socket.destroy();
      return;
    }

    const claims = await validateJwt(token);
    if (!claims) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nInvalid auth token\n");
      socket.destroy();
      return;
    }

    // Auth passed — complete the WebSocket handshake
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      // Attach user info to the socket for downstream handlers
      (ws as WebSocket & { userId?: string }).userId = claims.sub;
      wss.emit("connection", ws, req);
    });
  });

  // -- WebSocket connection handler -----------------------------------------

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const userId = (ws as WebSocket & { userId?: string }).userId;
    console.log(`[ws] Client connected (user: ${userId})`);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Instance manager and ws-server will handle routing.
        // For now, echo back to confirm connectivity.
        console.log(`[ws] Message from ${userId}:`, message.type);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      }
    });

    ws.on("close", () => {
      console.log(`[ws] Client disconnected (user: ${userId})`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Socket error (user: ${userId}):`, err.message);
    });

    // Send initial sync on connect
    ws.send(JSON.stringify({ type: "connected", userId }));
  });

  // -- Graceful shutdown ----------------------------------------------------

  function shutdown(signal: string) {
    console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

    // Close all WebSocket connections
    wss.clients.forEach((client) => {
      client.close(1001, "Server shutting down");
    });

    wss.close(() => {
      console.log("[server] WebSocket server closed");
    });

    server.close(() => {
      console.log("[server] HTTP server closed");
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      console.error("[server] Forced exit after timeout");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // -- Start listening ------------------------------------------------------

  server.listen(port, () => {
    console.log(
      `[server] Claude Hub running on http://localhost:${port} (${dev ? "development" : "production"})`
    );
  });
});
