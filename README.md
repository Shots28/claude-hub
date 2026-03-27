# Claude Hub

Mobile control center for Claude Code instances. A Slack-like PWA that lets you manage multiple Claude Code instances from your phone — send messages, approve permissions, switch between repos, and monitor execution in real time.

The phone UI is deployed to Vercel. A local bridge server on your machine listens for messages via Supabase and executes them with the Claude Agent SDK against your local repos.

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

- **Vercel** hosts the Next.js frontend and API routes — the UI you access from your phone
- **Supabase** sits in the middle as the coordination layer — it relays messages between the remote phone UI and local code execution
- **The bridge** (`server.ts`) runs on your dev machine, scans for local git repos, subscribes to Supabase Realtime for new messages, and executes them via the Claude Agent SDK
- **Message flow:** phone → API route → INSERT into Supabase `chat_messages` → Realtime event → bridge picks up → SDK streams response → UPDATE `chat_messages` → phone polls for updates

## Prerequisites

- **Node.js 22+** — required for native TypeScript execution (`node server.ts` runs directly without transpilation)
- **Supabase project** — free tier works fine
- **Claude Code subscription** — the SDK uses your existing `~/.claude/` auth, no API key needed
- **OpenAI API key** *(optional)* — enables voice-to-text input via Whisper

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Shots28/claude-hub.git
cd claude-hub
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Run database migrations

Apply the 8 migration files in `supabase/migrations/` sequentially:

**Option A — Supabase CLI:**
```bash
npx supabase db push
```

**Option B — SQL Editor:**
Open each file in `supabase/migrations/` (in timestamp order) and run them in the Supabase SQL Editor.

### 4. Enable Realtime

In the Supabase dashboard, go to **Database → Replication** and enable Realtime for these tables:
- `chat_messages`
- `instances`
- `permission_requests`

### 5. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Supabase keys from step 2. See [Configuration](#configuration) for all available variables.

### 6. Start the server

```bash
npm run dev
```

This runs `node server.ts` which starts Next.js and the bridge together. If env vars aren't loading automatically (no direnv), load them first:

```bash
set -a && source .env.local && set +a && npm run dev
```

On first run you'll see the repo scanner discover your local git repos and sync them to Supabase.

### 7. Create your account

Navigate to `http://localhost:3100`. You'll be prompted to create a username and password (minimum 8 characters). This is a one-time setup.

### 8. Deploy to Vercel (optional)

For phone access outside your local network:

1. Push to GitHub and connect the repo in Vercel
2. Set these environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy

**Note:** The bridge still runs locally on your machine. Vercel only hosts the UI — messages relay through Supabase to your local bridge.

## Usage

### Creating an instance

Tap **New** (mobile) or use the sidebar (desktop). Select a discovered repo and create — the instance uses sensible defaults:
- **Permission mode:** `bypassPermissions` (full autonomy)
- **Model:** `opus` (most capable)
- **Extended thinking:** enabled

The bridge auto-discovers repos from common directories (`~/Projects`, `~/Developer`, `~/code`, etc.). You can also enter a path manually or create a new folder directly from the modal.

### Sending messages

Type your message or use voice input (requires `OPENAI_API_KEY`). Messages relay through Supabase to the local bridge. Check the bridge status indicator in Settings to confirm the bridge is online.

### Full-page chats view

Navigate to `/chats` for a Slack-like full-page experience. The left panel shows all your instances grouped by repository, and the right panel displays the active chat. Click any instance to switch conversations instantly.

### Task panel

Click the **Tasks** button in the chat header to open the task panel. Use it to:
- Track ideas and work items
- Push tasks directly to the active chat as messages
- Mark tasks complete, edit, copy, or delete them

Tasks are stored locally in your browser (localStorage) and persist across sessions.

### Permission requests

When `permission_mode` is set to `default`, Claude will request approval for each tool use. A banner appears in the chat UI with approve/deny buttons. Permissions time out after **5 minutes** if not resolved.

### Session resumption

Claude Hub automatically resumes the previous conversation session for each instance. If resume fails (session expired, corrupted, etc.), it silently starts a fresh session — no action needed.

### Permission modes

| Mode | Behavior |
|------|----------|
| `bypassPermissions` | All tools auto-approved |
| `acceptEdits` | File edits auto-approved, other tools prompt |
| `plan` | Read-only planning mode |
| `default` | Prompt for every tool use |

## Configuration

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | auto-generated | JWT signing key (persisted to `data/.jwt-secret` if not set) |
| `MAX_CONCURRENT_QUERIES` | 3 | Concurrent Claude Code queries (1–20) |
| `IDLE_TIMEOUT_MINUTES` | 30 | Minutes before instance auto-stops (1–1440) |
| `PORT` | 3100 | Server port |
| `SHUTDOWN_TIMEOUT_MS` | 30000 | Graceful shutdown timeout in ms (5000–300000) |
| `STREAMING_DEBOUNCE_CHARS` | 50 | Characters before flushing streaming update (50–5000) |
| `MCP_PLAN_REVIEW_PATH` | — | Path to plan-review MCP server (skipped if not found) |
| `OPENAI_API_KEY` | — | For voice transcription via Whisper |

For full details with valid ranges, see [CLAUDE.md](CLAUDE.md#environment-variables).

### Concurrency

`MAX_CONCURRENT_QUERIES` controls how many instances can execute simultaneously. Excess queries are queued FIFO and picked up when a slot frees. The UI shows queued status while waiting.

## Backup & Restore

```bash
# Backup session files + metadata
./scripts/backup.sh

# Backups saved to data/backups/
# Keeps last 10 backups automatically
```

**Recommended:** Set up a daily cron job:
```bash
0 2 * * * cd /path/to/claude-hub && ./scripts/backup.sh
```

## Database

### Tables

| Table | Purpose |
|-------|---------|
| `chat_messages` | Primary message relay (Realtime-enabled) |
| `instances` | Instance config + status |
| `permission_requests` | Tool approval requests with timeout |
| `users` | Single-user authentication |
| `sessions` | Session history per instance |
| `discovered_repos` | Auto-discovered local repos |
| `bridge_status` | Bridge heartbeat (single row) |

See [CLAUDE.md](CLAUDE.md#database-schema) for the full schema.

### Migrations

Located in `supabase/migrations/`. Files are applied sequentially by timestamp prefix.

To add a new migration, create a file with the next timestamp:
```
supabase/migrations/20260325000009_your_change.sql
```

### Realtime

Tables `chat_messages`, `instances`, and `permission_requests` must have:
- **Realtime enabled** in the Supabase dashboard (Database → Replication)
- **`REPLICA IDENTITY FULL`** set (handled by migration `20260325000008`)

This is a common Supabase gotcha — Realtime must be explicitly enabled per table.

## Project Structure

```
server.ts              # Bridge server + repo scanner + Realtime listener
middleware.ts          # Edge auth middleware
app/
  (auth)/login/        # Login page
  (hub)/               # Hub layout + pages (instances, settings)
  (hub)/chats/         # Full-page Slack-like chats view
  api/auth/            # Login, setup, logout, check, reset
  api/instances/       # CRUD, messages, interrupt, sessions, cleanup
  api/permissions/     # Permission resolution
  api/repos/           # Repo discovery
  api/bridge/          # Bridge status
  api/health/          # Health check (no auth)
  api/transcribe/      # Voice-to-text
lib/                   # Core business logic (instance-manager, auth, types, etc.)
components/hub/        # Chat UI components
  task-panel.tsx       # Task/todo panel with localStorage persistence
  chat-view.tsx        # Main chat interface
  activity-item.tsx    # Tool call activity display
  create-instance-modal.tsx  # Simplified instance creation
supabase/migrations/   # 8 SQL migration files
scripts/backup.sh      # Backup script
```

See [CLAUDE.md](CLAUDE.md#project-structure) for the full file tree with descriptions.

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.2.1 | App Router — frontend + API routes |
| React | 19 | UI framework |
| TypeScript | 5 | Type safety (strict mode) |
| Supabase | 2.49+ | PostgreSQL + Realtime subscriptions |
| Claude Agent SDK | 0.1.0 | Claude Code instance management |
| Tailwind CSS | 4.2.2 | Styling |
| jose | 6 | JWT signing/verification (edge-compatible) |
| bcryptjs | 2.4.3 | Password hashing |
| react-markdown | 10 | Markdown rendering in chat |
| ws | 8 | WebSocket server |
| pidusage | 3 | Process CPU/memory metrics |

## Development

### Running locally

```bash
set -a && source .env.local && set +a && npm run dev
```

### Adding a new API route

Create `app/api/[name]/route.ts`. Pattern:

```typescript
import { getSessionFromCookies } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const session = await getSessionFromCookies(request.headers.get("cookie"));
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ... your logic
}
```

### Adding a migration

Create a new file in `supabase/migrations/` with the next timestamp prefix. Apply via Supabase CLI (`supabase db push`) or the SQL Editor.

## Troubleshooting

### Bridge won't connect

1. Check env vars are loaded: `echo $NEXT_PUBLIC_SUPABASE_URL` should print your URL
2. Check Supabase project is running (not paused)
3. Check `bridge_status` table in Supabase — `last_heartbeat_at` should be within 15 seconds

### Messages not appearing

1. Check bridge is online — Settings page shows bridge status
2. Check Realtime is enabled on `chat_messages` table in Supabase dashboard (Database → Replication)
3. Check terminal running `server.ts` for error messages

### "Resume failed" errors

Normal behavior — happens when a session expires or is corrupted. The bridge automatically starts a fresh session. No action needed.

### Where to find logs

- **Server console** (stdout/stderr) — real-time bridge activity
- **`data/events.log`** — structured JSON log (auto-rotates at 10MB)
- **Supabase dashboard** — database queries and Realtime activity

## License

Copyright (c) 2026 Samuel Hootini. All rights reserved.

This is proprietary software. No part of this codebase may be reproduced, distributed, or transmitted in any form without the prior written permission of the author.
