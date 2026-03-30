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

### Debug Endpoints

- `GET /api/health/db` — Database connection status, message counts, insert/select test
- `GET /api/bridge/status` — Bridge heartbeat (online/offline, last seen)
- `GET /api/instances/[id]/messages?_debug=true` — Returns debug info with messages
