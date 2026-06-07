#!/usr/bin/env bash
#
# Build-config injection guard.
#
# Detects the "EtherHiding" supply-chain backdoor (manus-connector campaign):
# an obfuscated payload grafted onto build-config files (postcss/vite/next/
# tailwind/svelte/astro/nuxt/rollup/webpack configs) plus removal of the broad
# `.env` rule from .gitignore (secret-exfiltration setup).
#
# Reliable detector = LINE LENGTH, not file size. A legit vite.config.ts can be
# several KB but never has a single line >= 2000 chars. Exits non-zero (fails
# CI) on any indicator.
set -uo pipefail

THRESHOLD=2000
CONFIG_RE='(postcss|vite|next|tailwind|svelte|astro|nuxt|rollup|webpack)\.config\.(mjs|js|cjs|ts)$'
infected=0

# Enumerate tracked build-config files (root and nested: apps/web, web, client,
# frontend, app, etc. — git ls-files already returns every tracked path).
files=$(git ls-files 2>/dev/null | grep -iE "$CONFIG_RE" || true)

for f in $files; do
  [ -f "$f" ] || continue
  maxlen=$(awk '{ if (length > m) m = length } END { print m + 0 }' "$f")
  if [ "${maxlen:-0}" -ge "$THRESHOLD" ]; then
    echo "INFECTED  $f  (line of $maxlen chars >= $THRESHOLD)"
    infected=1
    continue
  fi
  # Belt-and-suspenders: the specific IOC markers, even if shortened.
  if grep -q "createRequire(import.meta.url)" "$f" 2>/dev/null \
     && grep -qF "global['!']" "$f" 2>/dev/null; then
    echo "INFECTED  $f  (createRequire header + global['!'] payload)"
    infected=1
  fi
done

# The backdoor also strips the broad `.env` rule from .gitignore to allow a
# committed .env to be exfiltrated. Require it to remain ignored.
if [ -f .gitignore ] && ! grep -qE '^\.env(\*|$)' .gitignore; then
  echo "INFECTED  .gitignore no longer ignores .env* (exfiltration setup)"
  infected=1
fi

if [ "$infected" -ne 0 ]; then
  echo ""
  echo "Build-config injection guard: FAILED — see lines above."
  exit 1
fi
echo "Build-config injection guard: clean."
