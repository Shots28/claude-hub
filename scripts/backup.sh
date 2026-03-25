#!/bin/bash
# Claude Hub backup script
# Backs up Supabase data export + SDK session files
# Usage: ./scripts/backup.sh

set -euo pipefail

BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/claude-hub-${TIMESTAMP}.tar.gz"
SESSION_DIR="${HOME}/.claude/projects"

mkdir -p "${BACKUP_DIR}"

echo "Creating backup at ${BACKUP_FILE}..."

# Create a temporary directory for the backup contents
TMP_DIR=$(mktemp -d)
trap "rm -rf ${TMP_DIR}" EXIT

# Copy SDK session files if they exist
if [ -d "${SESSION_DIR}" ]; then
  echo "Backing up SDK session files..."
  cp -r "${SESSION_DIR}" "${TMP_DIR}/claude-sessions"
else
  echo "No SDK session files found at ${SESSION_DIR}, skipping..."
  mkdir -p "${TMP_DIR}/claude-sessions"
fi

# Create the archive
tar -czf "${BACKUP_FILE}" -C "${TMP_DIR}" .

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Retention: keep last 10 backups
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/claude-hub-*.tar.gz 2>/dev/null | wc -l)
if [ "${BACKUP_COUNT}" -gt 10 ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - 10))
  echo "Removing ${REMOVE_COUNT} old backup(s)..."
  ls -1t "${BACKUP_DIR}"/claude-hub-*.tar.gz | tail -n "${REMOVE_COUNT}" | xargs rm -f
fi

echo "Done. Backups retained: $(ls -1 "${BACKUP_DIR}"/claude-hub-*.tar.gz | wc -l)"
