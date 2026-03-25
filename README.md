# Claude Hub

Mobile control center for Claude Code instances. A Slack-like PWA that lets you manage multiple Claude Code instances from your phone.

## Architecture

```
Phone (PWA)
    ↕  Supabase Realtime + REST
Vercel (Next.js frontend)
    ↕  Supabase (database + realtime)
Local Bridge (on your machine)
    ↕  Claude Agent SDK
Your repos (local filesystem)
```

## Quick Start

```bash
# Clone
git clone https://github.com/Shots28/claude-hub.git
cd claude-hub

# Install
npm install

# Configure
cp .env.local.example .env.local
# Edit .env.local with your Supabase keys

# Dev
npm run dev

# Production
npm run build && npm start
```

## Tech Stack

- **Next.js 15** (App Router) — frontend + API routes
- **Supabase** — database + realtime subscriptions
- **Claude Agent SDK** — Claude Code instance management
- **Tailwind CSS 4** — styling
- **TypeScript** — everything

## Backup & Restore

```bash
# Backup (session files + metadata)
./scripts/backup.sh

# Backups saved to data/backups/
# Keeps last 10 backups automatically
```

**Recommended schedule**: Daily via cron
```bash
0 2 * * * cd /path/to/claude-hub && ./scripts/backup.sh
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `JWT_SECRET` | No | Auto-generated if not set |
| `MAX_CONCURRENT_QUERIES` | No | Default: 3 |
| `IDLE_TIMEOUT_MINUTES` | No | Default: 30 |
| `PORT` | No | Default: 3100 |

## License

Private — All rights reserved.
