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
    chats/page.tsx                 # Full-page Slack-like chats view
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
    sessions/
      all/route.ts                # GET: list all local IDE sessions across repos
      import/route.ts             # POST: import desktop session (create/find instance)
    repos/discover/route.ts       # GET: list discovered local repos
    bridge/status/route.ts        # GET: check bridge heartbeat
    health/route.ts               # GET: health check + memory stats (no auth)
    transcribe/route.ts           # POST: voice-to-text via OpenAI Whisper

lib/
  instance-manager.ts             # Core lifecycle: sendMessage, permissions, concurrency, streaming (~500 lines)
  auth.ts                         # JWT signing/verify (jose), bcrypt password hashing, cookie helpers
  supabase.ts                     # Server (service_role) + browser (anon) Supabase client init
  types.ts                        # All TypeScript types + Database interface for Supabase
  logger.ts                       # JSON structured logger → data/events.log (auto-rotate at 10MB)
  semaphore.ts                    # Async concurrency limiter (FIFO queue)
  use-realtime.ts                 # React hook: Supabase Realtime subscriptions + 1s polling fallback
  hub-context.tsx                 # React context provider wrapping useRealtime
  ws-server.ts                    # WebSocket server (rate-limited, JWT-authenticated)

components/
  hub/
    chat-view.tsx                 # Main chat UI container (includes TaskPanel integration)
    chat-input.tsx                # Message input field + send button + voice
    message-list.tsx              # Scrollable message history with auto-scroll
    message-bubble.tsx            # Individual message display (user/assistant)
    activity-item.tsx             # Tool call activity display with special UI for ExitPlanMode/AskUserQuestion
    task-panel.tsx                # Task/todo panel with localStorage persistence
    tool-call-block.tsx           # Tool invocation details display
    permission-banner.tsx         # Pending permission request with approve/deny
    create-instance-modal.tsx     # Simplified instance creation (folder selection only)
    instance-sidebar.tsx          # Desktop sidebar navigation
    instance-list-mobile.tsx      # Mobile bottom sheet navigation
    status-badge.tsx              # Instance status indicator (idle/running/error/etc.)
    streaming-text.tsx            # Animated text rendering for streaming responses
    resource-monitor.tsx          # System memory/CPU metrics display
    connection-status.tsx         # Unified connectivity banner (offline/bridge/realtime)
    global-session-picker.tsx     # Desktop session picker modal (all repos)
  ui/                             # Base UI components

supabase/
  migrations/                     # 10 SQL migration files (applied sequentially by timestamp)

e2e/
  auth-setup.ts                   # JWT cookie helper for authenticated tests
  session-sync.spec.ts            # Desktop→phone session sync tests (7 tests)
  final-qa.spec.ts                # Full QA test suite (21 tests)

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
| `instances` | Claude Code instance config + status (repo_path, permission_mode, model, current_session_id, status, is_pinned) |
| `sessions` | Session history per instance (started_at, message_count, summary) |
| `messages` | Message cache (legacy — SDK .jsonl sourced) |
| `chat_messages` | **Primary message relay** — Realtime-enabled, used for phone↔bridge communication |
| `pending_permissions` | Permission tracking (tool_name, input, status) |
| `permission_requests` | Tool approval requests with timeout (tool_name, tool_input, status, timeout_at) |
| `auth_reset_tokens` | Password reset tokens |
| `events` | Structured event log (level, event name, details JSON) |
| `discovered_repos` | Auto-discovered local repos (name, path) — synced by bridge on startup |
| `bridge_status` | Single-row heartbeat table (id="default", last_heartbeat_at, status) |
| `push_subscriptions` | Web Push notification subscriptions (endpoint, VAPID keys) |
| `local_sessions` | Desktop IDE session metadata — synced by bridge every 5 min for phone display |

**Realtime-enabled tables:** `chat_messages`, `instances`, `permission_requests`, `local_sessions`
- These tables have `REPLICA IDENTITY FULL` (required for Realtime UPDATE events)
- Realtime must be explicitly enabled per table in Supabase dashboard

**Migrations:** `supabase/migrations/` — 15 files, applied sequentially by timestamp prefix.

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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | — | VAPID public key for Web Push (browser-side) |
| `VAPID_PUBLIC_KEY` | — | — | VAPID public key (server-side, same value) |
| `VAPID_PRIVATE_KEY` | — | — | VAPID private key (server-side only) |
| `VAPID_SUBJECT` | — | — | VAPID subject (mailto: or URL) |
| `APP_URL` | — | — | App URL for bridge→API push calls (e.g. https://claude-hub.vercel.app) |
| `PUSH_API_SECRET` | — | — | Bearer token for bridge→push API auth |

## Important Implementation Details

- **Dual message pickup** (`server.ts`): Bridge uses BOTH Supabase Realtime subscription (primary, instant) AND 30-second polling interval (fallback). Both paths call `manager.sendMessage()`.
- **Deduplication** (`server.ts` poll loop): Poll only processes a queued instance if the latest `chat_messages` row has `role="user"` (no assistant reply yet). Once bridge responds, latest message becomes `role="assistant"` and poll won't re-trigger. Poll also checks `instanceLocks` before processing (skips if Realtime handler is active).
- **Bridge dedup eviction** (`server.ts`): `processedMessageIds` is a `Map<id, timestamp>` (not a Set). Entries older than 10 minutes are evicted every minute. Previous approach (clearing the entire Set every 5 minutes) created dedup gaps where messages processed just before the clear could be re-triggered.
- **Server-side idempotency** (`app/api/instances/[id]/messages/route.ts`): Before inserting a user message, checks for an identical message (same instance + content) within the last 30 seconds. Returns the existing message on duplicate — prevents phone retry logic from creating multiple DB rows.
- **Phone retry safety** (`lib/use-realtime.ts`): 30-second timeout (not 10s). Timeouts treated as success (message likely reached server). Only retries on server 500s or pre-connect network failures. Prevents the primary cause of duplicate messages.
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
- **Push notifications** (`lib/push-client.ts`, `lib/push-server.ts`): Web Push API for phone notifications. Bridge sends via `/api/push/send` (Bearer token auth). Subscriptions stored in `push_subscriptions` table. Notifies on: permission requests, instance completion, errors. Stale subscriptions (410 Gone) auto-deleted. Enable in Settings page.
- **Instance pinning** (`instances.is_pinned` column): Pinned instances sort to top in all list views. Toggle via 3-dots menu. Pin icon (blue) shown next to pinned instance names.
- **Attention tracking** (`lib/use-needs-attention.ts`): Detects instances needing user attention via two mechanisms: (1) live `running → idle` transition detection, (2) missed completion detection (idle instances with recent `updated_at` not yet seen). Shows amber "Approval" badge for pending permissions, green "Done" badge for completions. Attention items sorted to top in chat list. Dismissals tracked in localStorage as `{ instanceId: dismissedAtTimestamp }` — a completion is dismissed if `dismissedAt >= updated_at`. Entries auto-expire after 1 hour. Tapping a chat in the list calls `markSeen()` to immediately dismiss its badge. The hub layout's hook auto-dismisses completions when navigating to an instance page.
- **Message idempotency** (`app/api/instances/[id]/messages/route.ts`): POST endpoint checks for duplicate user messages with identical content within a 30-second window before inserting. Returns the existing message if found, preventing duplicates from phone retry logic when the server response doesn't reach the client (timeout/network).
- **Send retry logic** (`lib/use-realtime.ts`): Retry categorization — 500s are retriable, 4xx are not, timeouts are treated as success (server likely received it). 30-second fetch timeout (up from 10s) to accommodate Vercel cold starts. On timeout, starts polling for the response instead of retrying.
- **Unified connectivity status** (`components/hub/connection-status.tsx`): Single banner showing worst connectivity state. Priority: phone offline (red) > bridge offline with restart button (amber) > Supabase Realtime disconnected (yellow). Hidden when all healthy. Mounted in hub layout above all pages.
- **Instance auto-naming** (`app/api/instances/[id]/messages/route.ts`): On first user message, if the instance name is still the default repo folder name (e.g., "claude-hub" or "claude-hub (2)"), auto-renames to the first 80 chars of the user's prompt. Session imports also use session preview as the name. This gives instances descriptive names like "Fix the login bug" instead of generic repo names.
- **Repo path normalization**: Both instance creation (`POST /api/instances`) and session import (`POST /api/sessions/import`) strip trailing slashes from repo paths. Prevents duplicate instances caused by path variations (e.g., `/Users/foo/repo` vs `/Users/foo/repo/`).

## Interactive Tool UI

Certain tool calls display interactive UI elements in the chat:

### ExitPlanMode
When Claude completes a plan and calls `ExitPlanMode`, the UI displays:
- **Approve Plan** button — sends "Approved. Please proceed with the implementation."
- **Request Changes** button — prompts for feedback and sends "Please revise the plan: [feedback]"

### AskUserQuestion
When Claude asks the user a question via `AskUserQuestion`, the UI displays:
- Clickable option buttons for each provided choice
- **Other...** button for custom text input
- Multi-select support with **Submit Selection** button when `multiSelect` is enabled
- "Response sent" confirmation after interaction

These interactive elements appear inline with the tool call activity item and auto-hide after the user responds.

## Troubleshooting

### Messages Not Persisting (COMMON ISSUE)

**Symptoms**: Messages appear when sent but disappear after page refresh.

**Diagnostic endpoint**: `GET /api/health/db` — Returns database connection status and recent messages.

**Root causes and fixes**:

1. **Database migrations not run**
   - The `chat_messages` table may not exist or have wrong schema
   - Run migrations: Go to Supabase Dashboard → SQL Editor → Run contents of `supabase/migrations/*.sql` in order
   - Required tables: `instances`, `chat_messages`, `permission_requests`

2. **Environment variables not set on Vercel**
   - Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Check: Vercel Dashboard → Project → Settings → Environment Variables
   - The `SUPABASE_SERVICE_ROLE_KEY` is required for server-side API routes

3. **Wrong Supabase project**
   - Local `.env.local` may point to different project than Vercel env vars
   - Verify URL matches: Check `/api/health/db` response shows correct `supabaseUrl`

4. **Foreign key constraint**
   - Messages require valid `instance_id` referencing `instances` table
   - If instance was deleted, its messages are cascade-deleted

**Message flow**:
```
User sends message:
  → Frontend: use-realtime.ts sendMessage()
  → POST /api/instances/[id]/messages
  → Supabase: INSERT into chat_messages
  → Response: { message: {...}, queued: bool }

Page refresh:
  → ChatView mounts, calls loadMessages()
  → GET /api/instances/[id]/messages
  → Supabase: SELECT from chat_messages WHERE instance_id = ?
  → Response: { messages: [...], _debug: {...} }
```

**Debug logs to check** (Vercel Dashboard → Logs):
- `[messages/POST] User message inserted successfully, id: xxx` — INSERT worked
- `[messages/GET] Returning X messages (total count: Y)` — SELECT worked
- If POST succeeds but GET returns 0, check if instance_id matches

### Bridge Not Processing Messages

**Symptoms**: Messages send but Claude never responds, instance stays "queued".

**Cause**: The bridge (`server.ts`) is not running. On Vercel, only the Next.js app runs — the bridge must run separately on a server with the Claude CLI installed.

**Fix**: Run `npm run bridge` on a machine with Claude CLI access.

### Bridge Keeps Dying

**Symptoms**: Bridge goes offline repeatedly. Instances alternate between working and stuck.

**Root cause**: Claude instances running via the bridge can kill the bridge process itself — e.g., running `kill -9` or `pkill` targeting port 3100, or `lsof -ti:3100 | xargs kill`. This is **expected** when instances update `server.ts` and need to restart the server, but it takes down the bridge with no auto-restart.

**Fix**: Restart the bridge manually. Consider using a process manager (e.g., `pm2`) for auto-restart.

**Verify bridge is running**:
```bash
lsof -ti:3100    # Check process
# Check heartbeat in bridge_status table (should be < 30s old)
```

### Instances Stuck on "Queued"

**Symptoms**: Instance shows "queued" status but Claude never responds, even though the bridge is running.

**Root cause**: When the bridge crashes mid-execution (e.g., an instance kills port 3100), the `finally` block that resets instance status to "idle" never runs. The instance stays "queued" forever.

**Automatic fix**: Bridge startup now resets all stale "queued" instances to "idle" (`server.ts` startup cleanup). Restarting the bridge should clear stuck instances.

**Manual fix**: Reset via Supabase SQL: `UPDATE instances SET status = 'idle' WHERE status = 'queued';`

### Double Message Bubbles

**Symptoms**: User message appears twice in the chat — once immediately, then a duplicate when waiting for the bridge response.

**Root cause**: Race condition between three message insertion paths in `lib/use-realtime.ts`:
1. **Optimistic UI** — message added instantly with `optimistic-*` ID
2. **API response** — replaces optimistic with real DB message
3. **Polling** (1s interval) — fetches all messages from API and merges

If polling runs before the API response replaces the optimistic message, it adds the real DB message as a new entry (different ID from `optimistic-*`), resulting in two copies.

**Fix**: The polling merge logic now checks for optimistic messages with matching content before adding a new entry (commit 2b69e94).

### Duplicate Messages from Phone Retry Logic (3-4x responses)

**Symptoms**: User sends one message from phone, Claude responds 3-4 times with different responses. Some are duplicates, some are unique (Claude generates a fresh response each time).

**Root cause**: The phone's `sendMessage` in `lib/use-realtime.ts` had a 10-second timeout + 5 retries with exponential backoff. When the API took >10s (Vercel cold start, auto-naming DB queries), the timeout fired and the retry logic inserted **additional copies** of the same message, each with a **different database ID**. The bridge's `processedMessageIds` dedup didn't help because each retry created a distinct message.

**Timeline of the bug:**
1. Phone sends POST → message A inserted → Realtime fires for A
2. Phone times out (10s) → retry → message B inserted → Realtime fires for B
3. Another retry → message C inserted → Realtime fires for C
4. Bridge processes A, B, C as three separate messages → three different Claude responses

**Fix** (three layers of defense):

1. **Server-side idempotency** (`app/api/instances/[id]/messages/route.ts`): Before inserting, checks if an identical user message (same instance_id + content) exists within the last 30 seconds. If so, returns the existing message instead of inserting a duplicate. This is the primary defense.

2. **Client-side retry rewrite** (`lib/use-realtime.ts`): Timeout increased from 10s → 30s. Timeouts are now treated as success (message almost certainly reached the server; polling picks up the response). Retries only happen on clearly retriable errors (server 500s, pre-connect network failures). 4xx errors and post-connect failures are not retried.

3. **Bridge dedup hardening** (`server.ts`): `processedMessageIds` changed from `Set` (cleared entirely every 5 min, causing dedup gaps) to `Map<id, timestamp>` with per-entry eviction at 10 minutes. Poll now checks `instanceLocks` before processing (skips if Realtime handler is active).

4. **API route status race fix** (`app/api/instances/[id]/messages/route.ts`): The INSERT triggered Realtime instantly, but the UPDATE to "queued" ran after slow auto-naming queries. The bridge could finish and set "idle" before the API's UPDATE, which then overwrote "idle" → "queued" — causing the poll to re-process. Fix: set "queued" BEFORE the INSERT; auto-naming is now fire-and-forget.

5. **Re-check block removed** (`server.ts`): After `sendMessage()` completed, a re-check queried for unprocessed messages and called `sendMessage()` again without holding `instanceLocks`, racing with Realtime events. Removed entirely — the 30s poll fallback handles messages arriving during processing.

6. **Stuck "queued" reset** (`server.ts` poll): If the latest message is already "assistant" but instance is "queued" (from the status race), poll now resets to "idle" instead of leaving it stuck.

### Duplicate Messages from Session Sync

**Symptoms**: User sends one message from phone, it appears twice with two duplicate responses. Can cascade into a loop.

**Root cause**: Session sync re-imports messages the bridge just processed:
1. Phone sends "yup" → bridge processes via SDK → SDK writes to JSONL
2. `sessionMessageCounts` is NOT updated → session sync (10s later) sees new JSONL entries
3. Session sync inserts "yup" again into `chat_messages` → Realtime fires → bridge processes again
4. Secondary issue: `initSessionSyncCounts` counted DB rows (includes tool messages) but compared against JSONL text messages — mismatch caused false re-imports at startup

**Fix** (commit 4587394):
1. `initSessionSyncCounts` reads actual JSONL files instead of DB row count
2. `sessionMessageCounts` updated after every `sendMessage()` call
3. Session sync inserts wrapped in `instanceLocks` to prevent Realtime race

### Phantom Instances with Generic Names

**Symptoms**: Instances appear unexpectedly, all named after the repo folder (e.g., "claude-hub"), hard to tell apart.

**Root causes**:
1. **Session import auto-creates instances**: `POST /api/sessions/import` creates a new instance whenever you import a session for a repo that doesn't have one. Each click of "Continue from Desktop" can create one.
2. **Repo path mismatch creates duplicates**: A trailing slash difference (e.g., `/path/repo` vs `/path/repo/`) causes the `eq("repo_path", ...)` check to miss existing instances.
3. **Default names are generic**: Both create modal and session import used `folder.name` or `repoPath.split("/").pop()` as the name.

**Fix** (commit 494bf68):
1. Session import uses session preview (first user prompt) as instance name instead of repo name
2. First user message auto-renames instance if name still matches the default folder pattern
3. Repo paths normalized (trailing slashes stripped) in both create and import routes
4. Error details returned from create API for easier debugging

### Chats Disappear / "No Chats Yet" with Existing Instances

**Symptoms**: User opens the /chats page and sees "No chats yet" even though instances exist in the database. All chats vanish from the UI.

**Root cause**: `refreshInstances()` in `lib/use-realtime.ts` silently swallowed all fetch errors. If the auth cookie expired (or any API error occurred), the `/api/instances` call returned 401, `res.ok` was false, and the `setInstances` call was skipped — leaving the UI with an empty `[]` array and no error feedback.

**Why cookie expiry doesn't redirect**: The Edge middleware (`middleware.ts`) only checks cookie *existence*, not validity. An expired JWT still passes middleware (cookie exists) but fails `getSessionFromCookies()` verification in the API route → 401.

**Diagnostic steps**:
1. Check browser console for `[realtime] refreshInstances` errors
2. Hit `/api/instances` directly — if 401, cookie is expired
3. Verify instances exist: query `instances` table in Supabase
4. Check Vercel deployment status: `npx vercel ls` — ensure latest is "Ready"

**Fix**: `refreshInstances()` now handles errors explicitly:
- 401 → redirects to `/login` (forces re-authentication)
- Other HTTP errors → sets `connectionError` state, shown in UI with Retry button
- Network errors → sets `connectionError` with message

**Prevention**: Any new API-fetching callback in `use-realtime.ts` must handle non-ok responses explicitly. Never silently swallow errors for data that drives the main UI.

### Attention Badge Never Clears (2025-03-30)

**Symptoms**: "Done" badge on completed chats persists after tapping/viewing them. Counter says "4 need attention" but clicking one doesn't reduce it. Badge reappears on page refresh.

**Root causes**:
1. **`updated_at` drift invalidated seen markers**: Old code stored `inst.updated_at` timestamps in localStorage as "seen" keys. Any instance update (name change, status flip, bridge heartbeat) changed `updated_at`, so the stored timestamp no longer matched — badge reappeared.
2. **`markSeen` never called on mobile**: Tapping a chat in the mobile list navigated to `/instances/[id]` via `<Link>`, unmounting the chats page. `markSeen()` was never invoked. The layout hook's auto-clear effect should have handled it, but was unreliable due to bug #1.
3. **`markSeen` not destructured in chats page**: The return value was available from the hook but wasn't destructured.

**Fix**:
1. Replaced per-instance `Set<updated_at_timestamp>` with a single `Record<instanceId, dismissedAt>` map in localStorage (key: `hub_dismissed_completions`). A completion is dismissed if `dismissedAt >= new Date(updated_at).getTime()`. This survives `updated_at` drift because the dismiss timestamp is independent.
2. Added `onClick` handler on mobile chat `<Link>` and desktop `handleSelectInstance` to call `markSeen(inst.id)`.
3. Destructured `markSeen` from `useNeedsAttention` in chats page.

**Lesson**: Never key dismissal state on volatile database timestamps. Use the user's action timestamp compared against the data timestamp instead.

### Duplicate Messages from Phone Retry (2025-03-30)

**Symptoms**: User sends a message, phone shows "sending..." for too long, then two identical user messages appear with two responses.

**Root cause**: Phone's `sendMessage()` had a 10-second fetch timeout. On Vercel cold starts or slow auto-naming queries, the POST would succeed server-side (message inserted) but the response didn't reach the phone before timeout. Phone retried — second insert — bridge processed both.

**Fix** (three layers):
1. **Server-side idempotency** (`messages/route.ts`): Before inserting, checks for duplicate user messages with identical `content` + `instance_id` within a 30-second window. Returns the existing message if found (`deduplicated: true`).
2. **Smarter retry logic** (`use-realtime.ts`): Timeout (now 30s) is treated as "server likely received it" — starts polling instead of retrying. Only 500 errors and pre-connect network failures are retried. 4xx errors fail immediately.
3. **Bridge-side dedup eviction** (`server.ts`): `processedMessageIds` changed from `Set` (cleared every 5 min) to `Map<id, timestamp>` (entries evicted after 10 min, checked every 1 min). Eliminates the dedup gap window that existed when the entire Set was cleared.

**Lesson**: Idempotency must be enforced at the server level — client-side retry logic alone can't prevent duplicates when the failure mode is "request succeeded but response lost."

## Known Limitations

- Single-user only (no multi-user/multi-tenant support)
- Bridge must be running locally for messages to be processed
- No push notifications — uses polling + Supabase Realtime
- No offline mode — requires active Supabase connection
- Health metrics on Vercel show serverless stats, not bridge stats
- Tool outputs (command results, file contents) are not directly displayed — Claude's SDK processes them internally and the results appear in Claude's subsequent text responses
- Diff viewer is basic (shows old/new text blocks, not line-by-line diff)

---

## Operational Workflow (CRITICAL)

### Working with the Deployed Version

**Important**: Users typically access Claude Hub via the **deployed Vercel version**, not a local development server. This means:

1. **All code changes must be pushed to GitHub** for users to see them
2. **Vercel auto-deploys** from the `main` branch (usually takes 30-60 seconds)
3. **TypeScript errors will block deployment** — always run `npx tsc --noEmit` before pushing
4. **Browser cache** may show old UI — users should hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Deployment Checklist

```bash
# 1. Check for TypeScript errors FIRST
npx tsc --noEmit

# 2. If errors, fix them before proceeding

# 3. Commit and push
git add -A && git commit -m "Your message" && git push origin main

# 4. Monitor deployment
npx vercel ls 2>&1 | head -5
# Look for "● Ready" status on latest deployment

# 5. If deployment fails, check logs
npx vercel inspect <deployment-url>
```

### Restarting the Bridge Server

The bridge server runs locally and must be restarted carefully to avoid disconnecting the phone app:

```bash
# Kill existing processes cleanly
pkill -f "node server.ts" 2>/dev/null
lsof -ti:3100 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2

# Start fresh (in background so it persists)
set -a && source .env.local && set +a && nohup node server.ts > /tmp/claude-hub-bridge.log 2>&1 &

# Verify it started
sleep 8 && tail -20 /tmp/claude-hub-bridge.log
```

**Critical**: If bridge doesn't restart properly, the phone app will be disconnected. Always verify the bridge is running after restart.

---

## Lessons Learned

### Why Chat Persistence Breaks

1. **TypeScript errors block Vercel deployment**
   - Most common cause: Changes made locally but Vercel build fails silently
   - Always run `npx tsc --noEmit` before pushing
   - Check `npx vercel ls` to verify deployment status is "Ready"

2. **Database schema mismatches**
   - New required fields added to tables break INSERT operations
   - Example: `chat_messages` requires `tool_name` and `tool_id` fields (can be null)
   - Fix: Update INSERT statements to include all required fields

3. **Wrong instance/session IDs**
   - Messages tied to `instance_id` — if instance deleted, messages cascade-delete
   - Session resume requires valid `current_session_id` on instance

4. **Bridge not running**
   - Messages get "queued" but never processed
   - Instance stays in "queued" status indefinitely
   - Bridge heartbeat table shows offline status

5. **Duplicate bridge processes**
   - Two bridges running cause race conditions and message drops
   - Always kill all existing processes before starting new bridge

6. **Messages API returns oldest instead of newest (limit overflow)**
   - Root cause: `GET /api/instances/[id]/messages` ordered ASC with `.limit(500)` — returns the oldest 500, silently drops the newest when count > 500
   - Symptom: User sends messages, Claude responds, but on page refresh the latest messages are gone (old messages still show)
   - Trigger: Instance exceeds 500 total `chat_messages` rows (common after extended conversations with tool calls)
   - Fix: Order DESC with `.limit(500)` then reverse the result for chronological display
   - **CRITICAL**: Any query on `chat_messages` with a limit MUST order DESC first to get recent messages

### UI Issues and Fixes (2024-03-29)

1. **3-dots menu invisible on desktop**
   - Root cause: `opacity-0 group-hover:opacity-100` doesn't work on touch devices
   - Fix: Changed to `opacity-50 hover:opacity-100` (always visible, brighter on hover)

2. **3-dots menu on mobile triggers navigation instead of opening menu**
   - Root cause: Button was nested INSIDE `<Link>` component
   - Fix: Restructured layout to put button OUTSIDE Link in a flex container

3. **Multi-question forms submit on first click**
   - Root cause: Single-select options immediately called `onSendResponse()`
   - Fix: Track selections in state (`singleSelections` Map), show Submit button only when all questions answered

4. **Plan viewer not showing "View Plan" button**
   - Root cause: ExitPlanMode doesn't include plan path; UI must detect it from prior Write messages
   - Fix: MessageList tracks recent `.claude/plans/*.md` writes and passes path to ExitPlanMode activity item

5. **New instances don't show recently cloned repos**
   - Root cause: Bridge scans folders only on startup, not when creating new instance
   - Fix: Added POST `/api/repos/discover` endpoint that triggers fresh scan; called when opening Create Instance modal

### Bridge Cache Refresh

The bridge maintains two caches:
- `localRepoPaths` — Set of folder paths it manages
- `localInstanceIds` — Set of instance IDs for those repos

**Problem**: If a new repo is added after bridge starts, it won't process messages for instances in that repo.

**Solution**: Bridge now listens to `discovered_repos` table changes via Realtime and refreshes its caches:
```typescript
bridgeSupabase
  .channel("bridge-discovered-repos")
  .on("postgres_changes", { event: "*", schema: "public", table: "discovered_repos" }, () => {
    debouncedRefresh(); // Refreshes both caches
  })
  .subscribe();
```

### Stuck Instances

Instances can get stuck in "running" or "queued" status:

1. **Running but not processing** — Bridge crashed mid-execution
   - Fix: Reset to "idle" via direct Supabase update, or restart bridge (auto-resets stale instances)

2. **Queued but not picked up** — Instance's `repo_path` not in bridge's `localRepoPaths`
   - Fix: Trigger folder rescan (POST `/api/repos/discover`), restart bridge, or manually add to `discovered_repos`

3. **Multiple bridges running** — Race condition causes neither to process correctly
   - Fix: Kill all bridge processes, start single instance

### UI Component Gotchas (2024-03-29)

1. **Multiple chat list components exist**
   - `instance-list-mobile.tsx` — Used in the sidebar sheet
   - `chats/page.tsx` — Has its **own inline ChatList** component for the /chats route
   - **Lesson**: When fixing mobile chat list UI, check BOTH files - they are NOT shared

2. **Double confirmation dialogs**
   - Root cause: Both `MobileActionMenu` AND the parent's `handleDelete` had `confirm()` calls
   - Fix: Remove `confirm()` from the menu component, let parent handle it
   - **Lesson**: Confirmation dialogs should be in ONE place (preferably the handler, not the menu)

3. **Diff view for Edit operations**
   - Added simple mobile-friendly diff view in `activity-item.tsx`
   - Shows removed code (red) and added code (green) when expanding Edit activities
   - Falls back to JSON for non-Edit tools
   - Uses `whitespace-pre-wrap` and `break-all` for mobile readability

4. **Touch device hover states**
   - `opacity-0 group-hover:opacity-100` is invisible on touch devices (no hover state)
   - Always use visible default: `opacity-50 hover:opacity-100` or add explicit tap target
   - Mobile buttons need `min-h-[52px]` or similar for adequate tap targets

5. **Button inside Link prevents click handlers**
   - Buttons inside `<Link>` components will navigate instead of firing onClick
   - Solution: Restructure as siblings in a flex container
   ```tsx
   <div className="flex">
     <Link className="flex-1">...</Link>
     <button className="flex-shrink-0">Menu</button>
   </div>
   ```

6. **File viewer expects relative paths**
   - Bridge's `handleFileRequest` resolves paths relative to `repo_path`
   - Absolute paths like `/Users/foo/repo/.claude/plans/my-plan.md` fail
   - Must extract relative portion: `.claude/plans/my-plan.md`
   - Use regex capture: `filePath.match(/(\.claude\/plans\/.*\.md)$/)`

7. **Claude writes plans to global ~/.claude/plans/, not repo**
   - Claude CLI writes plan files to `~/.claude/plans/` (global), NOT `repo/.claude/plans/`
   - Bridge now checks both locations: first repo, then `~/.claude/plans/`
   - This allows viewing plans that Claude created in any repo

### Session Sync (IDE ↔ Hub)

Claude Hub can sync with Claude Code IDE (VS Code, CLI) sessions:

**How it works:**
1. Claude stores sessions in `~/.claude/projects/{project-key}/{session-id}.jsonl`
2. Project key = repo path with `/` → `-` (e.g., `/Users/foo/repo` → `-Users-foo-repo`)
3. Bridge scans these files and syncs session metadata to `local_sessions` Supabase table every 5 minutes
4. Session previews are extracted from the first user message, with IDE/system tags stripped
5. Live sync: bridge polls active session JSONL files every 10s, appends new messages to `chat_messages`

**Path resolution (`resolveProjectPath` in `server.ts`):**
Converting project keys back to paths is ambiguous when directory names contain dashes (e.g., `claude-hub` vs `claude/hub`). The `resolveProjectPath()` function walks the filesystem trying longest-match-first: for each group of dash-separated parts, it tries combining them into a single directory name (longest first), falling back to treating the dash as a path separator. This correctly resolves `-Users-agents-claude-hub` → `/Users/agents/claude-hub`.

**API Endpoints:**
- `GET /api/sessions/all` — Lists ALL local IDE sessions across all repos (from `local_sessions` table)
- `POST /api/sessions/import` — Creates/finds instance for a repo, sets session ID (triggers bridge import)
- `GET /api/instances/[id]/sessions/local` — Lists local IDE sessions for a specific repo
- `POST /api/instances/[id]/sessions/switch` — Switch to a different session (imports messages)

**UI Flow (Global — from Chats page):**
1. Tap "Desktop" button on the Chats page header
2. GlobalSessionPicker modal shows all IDE sessions grouped by repo
3. Tap a session → import endpoint creates/finds instance, sets session → `refreshInstances()` → navigate to instance
4. Continue the conversation from your phone

**UI Flow (Per-instance — from Chat header):**
1. Tap "Sync" button in chat header
2. See list of IDE sessions for that specific repo
3. Tap a session to switch and import its history

**Session preview extraction** (`server.ts` `extractCleanPreview()`):
- Strips XML-like tags and their content (e.g., `<ide_selection>...`, `<system-reminder>...`)
- Strips self-closing/orphaned tags, collapses whitespace
- Returns first 100 chars of cleaned text
- Without this, previews show raw IDE context like "ide open file: the user opened the file..."

**Instance page race condition** (`app/(hub)/instances/[id]/page.tsx`):
- After importing a session, `router.push(/instances/{id})` navigates before `useHubRealtime()` has fetched the new instance
- Fix: Instance page calls `refreshInstances()` on mount if instance not found, shows spinner while loading
- GlobalSessionPicker also calls `await refreshInstances()` before navigating

**Import route gotchas** (`app/api/sessions/import/route.ts`):
- `instances` table has `id TEXT PRIMARY KEY` with no default — must provide `randomUUID()`
- `maybeSingle()` errors if multiple instances exist for the same repo — use `.limit(1)` instead
- Must include `allowed_tools: []` in insert (required field)

**Limitations:**
- Session files must exist on the machine running the bridge
- Switching sessions replaces the current chat history in Supabase
- Tool outputs (file contents, command results) are not imported
- Bridge restart needed after code changes to `server.ts` for preview cleanup to take effect

**Deduplication (critical for preventing double messages):**

The live session sync polls JSONL files every 10 seconds and inserts new messages into `chat_messages`. Without proper deduplication, messages sent from the phone get duplicated:
1. Phone sends message → bridge processes via SDK → SDK writes to JSONL
2. Session sync sees new JSONL entries → re-imports them → duplicate messages
3. Realtime fires for the duplicates → bridge processes again → duplicate responses

Four mechanisms prevent this:
- **`sessionMessageCounts`** — Tracks the JSONL text message count per instance. Updated after every `sendMessage()` call (before releasing instance lock) and initialized by reading actual JSONL files (not DB rows, which include tool messages and diverge from JSONL counts).
- **Content-based dedup** — Before inserting, sync checks existing `chat_messages` content to skip messages that already exist in the DB. Catches edge cases where count-based dedup fails due to race conditions.
- **`instanceLocks`** — Session sync acquires the instance lock before inserting, preventing the Realtime handler from racing (the INSERT triggers a Realtime event that could arrive before `processedMessageIds` is updated). Lock is released AFTER updating `sessionMessageCounts` to close the race window.
- **`processedMessageIds`** — All inserted user message IDs are added to this set so the Realtime handler skips them.

### Debug Endpoints

- `GET /api/health/db` — Database connection status, message counts, insert/select test
- `GET /api/bridge/status` — Bridge heartbeat (online/offline, last seen)
- `GET /api/instances/[id]/messages?_debug=true` — Returns debug info with messages
