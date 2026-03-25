// ---------------------------------------------------------------------------
// Claude Hub — Claude Agent SDK StreamEvent → ServerMessage Normalizer
// ---------------------------------------------------------------------------
// Maps raw streaming events from the Claude Agent SDK into the ServerMessage
// types used by our WebSocket protocol.
//
// The SDK emits events such as:
//   - content_block_delta  (text chunk or tool input delta)
//   - content_block_start  (new content block — text or tool_use)
//   - content_block_stop   (content block finished)
//   - message_start        (new message started)
//   - message_delta        (message-level updates like stop_reason)
//   - message_stop         (message complete)
//   - error                (stream error)
//
// We translate a subset of these into our ServerMessage union. Events we don't
// care about return null and are silently dropped by the caller.
// ---------------------------------------------------------------------------

import type {
  ServerMessage,
  ServerTextDelta,
  ServerToolStart,
  ServerToolResult,
  ServerMessageDone,
  ServerError,
  ToolInput,
} from "./types";

// ---- Internal accumulators ----

// We need to accumulate tool input deltas so we can emit a complete ToolInput
// when the tool_use content block stops. Keyed by `${instanceId}:${blockIndex}`.
const toolInputBuffers = new Map<
  string,
  { toolName: string; toolId: string; partialJson: string }
>();

/**
 * Normalize a Claude Agent SDK streaming event into a ServerMessage.
 *
 * @param instanceId - The Claude Hub instance this event belongs to
 * @param event      - Raw streaming event from the SDK
 * @returns A ServerMessage to forward to the client, or null to skip
 */
export function normalizeEvent(
  instanceId: string,
  event: Record<string, unknown>,
): ServerMessage | null {
  const eventType = event.type as string | undefined;
  if (!eventType) return null;

  switch (eventType) {
    // ---- Text streaming ----
    case "content_block_delta": {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!delta) return null;

      if (delta.type === "text_delta" && typeof delta.text === "string") {
        return {
          type: "text_delta",
          instanceId,
          delta: delta.text,
        } satisfies ServerTextDelta;
      }

      // Tool input JSON delta — accumulate for later
      if (
        delta.type === "input_json_delta" &&
        typeof delta.partial_json === "string"
      ) {
        const blockIndex = event.index as number;
        const key = `${instanceId}:${blockIndex}`;
        const buf = toolInputBuffers.get(key);
        if (buf) {
          buf.partialJson += delta.partial_json;
        }
        return null;
      }

      return null;
    }

    // ---- New content block (text or tool_use) ----
    case "content_block_start": {
      const contentBlock = event.content_block as
        | Record<string, unknown>
        | undefined;
      if (!contentBlock) return null;

      if (contentBlock.type === "tool_use") {
        const toolId = (contentBlock.id as string) ?? "";
        const toolName = (contentBlock.name as string) ?? "unknown";
        const blockIndex = event.index as number;

        // Start accumulating input JSON for this tool block
        const key = `${instanceId}:${blockIndex}`;
        toolInputBuffers.set(key, { toolName, toolId, partialJson: "" });

        // Emit tool_start immediately (input will arrive as deltas)
        return {
          type: "tool_start",
          instanceId,
          toolName,
          toolId,
          input: (contentBlock.input as ToolInput) ?? {},
        } satisfies ServerToolStart;
      }

      // Text blocks don't need a start event — we stream via text_delta
      return null;
    }

    // ---- Content block finished ----
    case "content_block_stop": {
      const blockIndex = event.index as number;
      const key = `${instanceId}:${blockIndex}`;
      const buf = toolInputBuffers.get(key);

      if (buf) {
        toolInputBuffers.delete(key);

        // Parse accumulated JSON input for the tool result
        let parsedInput: ToolInput = {};
        if (buf.partialJson) {
          try {
            parsedInput = JSON.parse(buf.partialJson) as ToolInput;
          } catch {
            // Malformed JSON — send what we have as a string
            parsedInput = { _raw: buf.partialJson };
          }
        }

        return {
          type: "tool_result",
          instanceId,
          toolId: buf.toolId,
          output: JSON.stringify(parsedInput),
          isError: false,
        } satisfies ServerToolResult;
      }

      return null;
    }

    // ---- Message complete ----
    case "message_stop": {
      const message = event.message as Record<string, unknown> | undefined;
      const messageId =
        (message?.id as string) ??
        (event["amazon.bedrock"]
          ? undefined
          : (event.id as string | undefined)) ??
        `msg_${Date.now()}`;

      return {
        type: "message_done",
        instanceId,
        messageId,
      } satisfies ServerMessageDone;
    }

    // ---- Message-level delta (check for stop_reason with tool results) ----
    case "message_delta": {
      // The SDK sends message_delta with a stop_reason when the turn ends.
      // We use message_stop instead for our "done" signal, so skip this.
      return null;
    }

    // ---- Result message from a completed turn ----
    case "result": {
      // Some SDK versions emit a "result" event with the full final message.
      const message = event.message as Record<string, unknown> | undefined;
      if (!message) return null;

      const messageId = (message.id as string) ?? `msg_${Date.now()}`;
      return {
        type: "message_done",
        instanceId,
        messageId,
      } satisfies ServerMessageDone;
    }

    // ---- Stream error ----
    case "error": {
      const errorObj = event.error as Record<string, unknown> | undefined;
      const message =
        (errorObj?.message as string) ??
        (event.message as string) ??
        "Unknown stream error";

      return {
        type: "error",
        instanceId,
        message,
        code: (errorObj?.type as string) ?? undefined,
      } satisfies ServerError;
    }

    // ---- Events we don't translate ----
    // message_start, ping, etc.
    default:
      return null;
  }
}

/**
 * Clear any accumulated tool input buffers for a given instance.
 * Call this when an instance is stopped or reset to prevent memory leaks.
 */
export function clearInstanceBuffers(instanceId: string): void {
  for (const key of toolInputBuffers.keys()) {
    if (key.startsWith(`${instanceId}:`)) {
      toolInputBuffers.delete(key);
    }
  }
}
