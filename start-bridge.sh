#!/bin/bash
# Start the Claude Hub bridge server with correct environment
# Usage: ./start-bridge.sh
#
# This script explicitly loads .env.local to prevent stale shell
# environment variables from overriding Supabase credentials.

set -e
cd "$(dirname "$0")"

# Clear any stale env vars
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY JWT_SECRET VERCEL_OIDC_TOKEN

# Load from .env.local
set -a
source .env.local
set +a

echo "[start-bridge] Using Supabase: ${NEXT_PUBLIC_SUPABASE_URL}"
echo "[start-bridge] Starting bridge on port ${PORT:-3100}..."

exec npx tsx server.ts
