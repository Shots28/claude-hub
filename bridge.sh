#!/bin/bash
# ---------------------------------------------------------------------------
# Claude Hub — Bridge Wrapper Script
# Keeps the bridge server alive by restarting it automatically on exit.
# Usage: ./bridge.sh
# ---------------------------------------------------------------------------

set -a
source "$(dirname "$0")/.env.local"
set +a

RESTART_DELAY=3

echo "[bridge.sh] Starting bridge with auto-restart (${RESTART_DELAY}s delay)..."

while true; do
  echo "[bridge.sh] Starting bridge server..."
  node "$(dirname "$0")/server.ts"
  EXIT_CODE=$?

  echo "[bridge.sh] Bridge exited with code $EXIT_CODE"

  if [ $EXIT_CODE -eq 42 ]; then
    echo "[bridge.sh] Exit code 42 — stopping (no restart)."
    break
  fi

  echo "[bridge.sh] Restarting in ${RESTART_DELAY}s..."
  sleep $RESTART_DELAY
done
