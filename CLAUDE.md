# Claude Hub

Mobile control center (PWA) for managing multiple Claude Code instances from your phone.

- Single-user, private project
- Next.js 16 (App Router) + TypeScript 5 (strict) + React 19
- Deployed: Vercel (frontend) + local bridge server (on developer machine)
- Database: Supabase (PostgreSQL + Realtime subscriptions)
- AI: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

## Architecture

```
Phone (PWA)
    ↕  Supabase Realtime + REST
Vercel (Next.js frontend + API routes)
    ↕  Supabase (database + realtime)
Local Bridge (server.ts on your machine)
    ↕  Claude Agent SDK
Your repos (local filesystem)
```

**Data flow — sending a message:**
Phone → POST `/api/instances/[id]/messages` → INSERT into `chat_messages` → Supabase Realtime event → bridge picks up → SDK `query()` → stream events → UPDATE `chat_messages` → phone polls/subscribes for updates

- Vercel hosts only the UI + API routes (no bridge)
- Supabase is the coordination layer between remote phone UI and local execution
- The bridge (`server.ts`) must be running on the developer's machine for messages to be processed

## Key Concepts

- **Instance** — a configured Claude Code agent pointing at a specific local repo
- **Bridge** — local Node.js process that listens for user messages via Supabase Realtime and executes them with Claude Agent SDK
- **Session** — a Claude Code session ID used for conversation resumption across messages
- **Permission request** — tool approval flow: bridge creates DB row, phone UI shows approve/deny banner, 5-minute timeout

## Commands

```bash
npm run dev    # node server.ts (dev mode, Node 22 native TS execution)
npm run build  # next build
npm start      # NODE_ENV=production node server.ts
npm run lint   # next lint (ESLint)
```

Note: `node server.ts` works directly — Node 22 executes TypeScript natively (no tsx/transpilation needed for the server entry point).

Env vars must be loaded first if not using direnv:
```bash
set -a && source .env.local && set +a && npm run dev
```

## Tech Stack

- **Next.js** 16.2.1 (App Router) — frontend + API routes
- **React** 19 — UI
- **TypeScript** 5 (strict mode) — everything
- **Supabase** (`@supabase/supabase-js` v2) — PostgreSQL + Realtime subscriptions
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk` v0.1.0) — Claude Code instance management
- **Tailwind CSS** 4.2.2 — styling
- **jose** 6 — JWT signing/verification (edge-compatible)
- **bcryptjs** 2.4.3 — password hashing (12 salt rounds)
- **ws** 8 — WebSocket server
- **pidusage** 3 — CPU/memory usage tracking
- **react-markdown** + **remark-gfm** — markdown rendering in chat

## Project Structure

```
server.ts                          # Bridge server: Next.js + repo scanner + Supabase Realtime listener
middleware.ts                      # Edge auth middleware (cookie check, redirect to /login)

app/
  layout.tsx                       # Root layout (dark theme, viewport meta for mobile)
  globals.css                      # Tailwind @theme with custom hub-* colors
  (auth)/login/page.tsx            # Login page
  (hub)/
    layout.tsx                     # Hub layout (sidebar + bottom nav + realtime provider)
    page.tsx                       # Home: redirect to first instance or empty state
    instances/[id]/page.tsx        # Chat page for a specific instance
    settings/page.tsx              # Bridge status, logout, about
  api/
    auth/
      login/route.ts              # POST: authenticate, set JWT cookie
      setup/route.ts              # GET: check if user exists; POST: create first user
      logout/route.ts             # POST: clear cookie
      check/route.ts              # GET: verify current session
      reset/route.ts              # POST: password reset
    instances/
      route.ts                    # GET: list all; POST: create new
      [id]/route.ts               # GET/PATCH/DELETE single instance
      [id]/messages/route.ts      # GET: fetch messages; POST: send user message
      [id]/interrupt/route.ts     # POST: abort running instance
      [id]/sessions/route.ts      # GET: list sessions
      cleanup/route.ts            # POST: cleanup stale instances
    permissions/
      [id]/resolve/route.ts       # POST: approve/deny permission request
    repos/discover/route.ts       # GET: list discovered local repos
    bridge/status/route.ts        # GET: check bridge heartbeat
    health/route.ts               # GET: health check + memory stats (no auth)
    transcribe/route.ts           # POST: voice-to-text via OpenAI Whisper

lib/
  instance-manager.ts             # Core lifecycle: sendMessage, permissions, concurrency, streaming (~500 lines)
  auth.ts                         # JWT signing/verify (jose), bcrypt password hashing, cookie helpers
  supabase.ts                     # Server (service_role) + browser (anon) Supabase client init
  types.ts                        # All TypeScript types + Database interface for Supabase
  event-normalizer.ts             # Maps SDK stream events to ServerMessage union types
  logger.ts                       # JSON structured logger → data/events.log (auto-rotate at 10MB)
  semaphore.ts                    # Async concurrency limiter (FIFO queue)
  use-realtime.ts                 # React hook: Supabase Realtime subscriptions + 1s polling fallback
  hub-context.tsx                 # React context provider wrapping useRealtime
  ws-server.ts                    # WebSocket server (rate-limited, JWT-authenticated)

components/
  hub/
    chat-view.tsx                 # Main chat UI container
    chat-input.tsx                # Message input field + send button + voice
    message-list.tsx              # Scrollable message history with auto-scroll
    message-bubble.tsx            # Individual message display (user/assistant)
    tool-call-block.tsx           # Tool invocation details display
    permission-banner.tsx         # Pending permission request with approve/deny
    create-instance-modal.tsx     # Modal: create new instance (repo, mode, model)
    instance-sidebar.tsx          # Desktop sidebar navigation
    instance-list-mobile.tsx      # Mobile bottom sheet navigation
    status-badge.tsx              # Instance status indicator (idle/running/error/etc.)
    streaming-text.tsx            # Animated text rendering for streaming responses
    resource-monitor.tsx          # System memory/CPU metrics display
  ui/                             # Base UI components

supabase/
  migrations/                     # 8 SQL migration files (applied sequentially by timestamp)

scripts/
  backup.sh                      # Backup SDK session files + metadata (keeps last 10)

data/                             # Runtime data (events.log, .jwt-secret) — gitignored
public/
  manifest.json                   # PWA manifest
```

## Database Schema

All tables defined in the `Database` interface in `lib/types.ts`. RLS disabled (single-user app). Service role key used server-side.

| Table | Purpose |
|-------|---------|
| `users` | Single-user auth (username, password_hash) |
| `instances` | Claude Code instance config + status (repo_path, permission_mode, model, current_session_id, status) |
| `sessions` | Session history per instance (started_at, message_count, summary) |
| `messages` | Message cache (legacy — SDK .jsonl sourced) |
| `chat_messages` | **Primary message relay** — Realtime-enabled, used for phone↔bridge communication |
| `pending_permissions` | Permission tracking (tool_name, input, status) |
| `permission_requests` | Tool approval requests with timeout (tool_name, tool_input, status, timeout_at) |
| `auth_reset_tokens` | Password reset tokens |
| `events` | Structured event log (level, event name, details JSON) |
| `discovered_repos` | Auto-discovered local repos (name, path) — synced by bridge on startup |
| `bridge_status` | Single-row heartbeat table (id="default", last_heartbeat_at, status) |

**Realtime-enabled tables:** `chat_messages`, `instances`, `permission_requests`
- These tables have `REPLICA IDENTITY FULL` (required for Realtime UPDATE events)
- Realtime must be explicitly enabled per table in Supabase dashboard

**Migrations:** `supabase/migrations/` — 8 files, applied sequentially by timestamp prefix.

## Patterns and Conventions

- File-level banner comments: `// Claude Hub — [description]`
- API route auth: call `getSessionFromCookies()` from `lib/auth.ts` (not middleware-level JWT verification — middleware only checks cookie existence)
- DB row types use `type` keyword (not `interface`) — required because TypeScript interfaces don't satisfy `Record<string, unknown>` under strict mode, causing Supabase `GenericTable` constraint failures and `never` return types from `.from()`
- Path alias: `@/*` maps to project root
- Tailwind custom colors (defined in `app/globals.css` `@theme` block):
  - `hub-bg` (#0a0a0a), `hub-surface` (#141414), `hub-surface-2` (#1e1e1e)
  - `hub-border` (#2a2a2a), `hub-text` (#e5e5e5), `hub-text-muted` (#a3a3a3)
  - `hub-accent` (#3b82f6), `hub-accent-hover` (#2563eb)
  - `hub-success` (#22c55e), `hub-warning` (#eab308), `hub-error` (#ef4444)
- No test framework — no tests exist
- No CI/CD pipeline — no GitHub Actions
- ESLint: `eslint-config-next` v15

## Environment Variables

**Required:**
| Variable | Validated by | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `server.ts` REQUIRED_ENV | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side (browser) | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | `server.ts` REQUIRED_ENV | Supabase service role key (server-side only) |
| `JWT_SECRET` | `server.ts` REQUIRED_ENV | JWT signing key. Bridge requires it. If not set, `lib/auth.ts` `resolveSecret()` auto-generates and persists to `data/.jwt-secret` (0o600) — but the bridge exits before that path runs. Effectively required for local dev. |

**Optional** (validated in `server.ts` `numericEnvVars` object):
| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `MAX_CONCURRENT_QUERIES` | 3 | 1–20 | Concurrent Claude Code queries |
| `IDLE_TIMEOUT_MINUTES` | 30 | 1–1440 | Minutes before instance auto-stops |
| `SHUTDOWN_TIMEOUT_MS` | 30000 | 5000–300000 | Graceful shutdown timeout |
| `STREAMING_DEBOUNCE_CHARS` | 50 | 50–5000 | Characters before flushing streaming DB update |
| `PORT` | 3100 | — | Server port |
| `MCP_PLAN_REVIEW_PATH` | `/Users/agents/tools/plan-review-mcp` | — | Path to plan-review MCP server (skipped if not found) |
| `OPENAI_API_KEY` | — | — | For voice transcription via Whisper (optional) |

## Important Implementation Details

- **Dual message pickup** (`server.ts`): Bridge uses BOTH Supabase Realtime subscription (primary, instant) AND 30-second polling interval (fallback). Both paths call `manager.sendMessage()`.
- **Deduplication** (`server.ts` poll loop): Poll only processes a queued instance if the latest `chat_messages` row has `role="user"` (no assistant reply yet). Once bridge responds, latest message becomes `role="assistant"` and poll won't re-trigger.
- **Message ordering** (`server.ts` poll loop): If multiple user messages arrive while busy, poll processes the LATEST one. This is correct because session resume gives Claude the full conversation history.
- **Session resume** (`lib/instance-manager.ts` `sendMessage()`): `instance.current_session_id` is passed to SDK `query()` with `resume` option. If resume throws (any error), clears session ID and starts fresh. No user-visible disruption.
- **Concurrency** (`lib/instance-manager.ts` `Semaphore` class): FIFO async semaphore limits concurrent SDK queries. Default 3 permits. Excess queries wait in queue.
- **Streaming lifecycle** (`lib/instance-manager.ts`): Assistant message created with `status="streaming"` → content updated periodically (debounced by char count) → finalized to `status="done"` in `finally` block. On error, set to `status="error"`.
- **Multi-turn handling** (`lib/instance-manager.ts`): On `message_start` stream event, if text already exists, finalizes current message and creates a new `chat_messages` row for the new turn.
- **Optimistic UI** (`lib/use-realtime.ts`): User messages appear instantly in the chat with a temporary ID, replaced with the server-generated version on API response.
- **Phone-side polling** (`lib/use-realtime.ts`): 1-second polling interval while waiting for assistant response (Realtime may not work reliably in mobile browsers).
- **Permission mode mapping** (`lib/instance-manager.ts`): DB value `"auto"` maps to SDK `"bypassPermissions"`. Valid SDK modes: `bypassPermissions`, `acceptEdits`, `plan`, `default`.
- **Intentional `as any` casts** (`lib/instance-manager.ts`, API routes): Used on `supabase.from()` calls as a workaround — the hand-written `Database` interface doesn't always satisfy Supabase's strict `GenericTable` constraints at compile time, but works correctly at runtime.
- **Startup cleanup** (`server.ts`): On bridge start, resets stale "running" instances to "queued" and marks orphaned "streaming" messages as "error" with "[Bridge restarted]" content.

## Known Limitations

- Single-user only (no multi-user/multi-tenant support)
- Bridge must be running locally for messages to be processed
- No push notifications — uses polling + Supabase Realtime
- No offline mode — requires active Supabase connection
- Health metrics on Vercel show serverless stats, not bridge stats
- No code diff viewer — assistant responses are plain text/markdown
