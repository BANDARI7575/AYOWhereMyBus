#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "--apply" || "${2:-}" != "--schema-compatible" ]]; then
  echo 'No rollback performed. After approval and schema review: rollback.sh --apply --schema-compatible'
  echo 'Set the previous approved AYO_RELEASE_ID, matching schedule path, and the same protected secret/state configuration.'
  exit 0
fi
: "${AYO_RELEASE_ID:?set previous reviewed release ID}"
: "${AYO_ENV_FILE:?set protected env path for matching schedule}"
: "${AYO_BACKUP_DIR:?set protected in-container persistent backup directory}"
if [[ ! "$AYO_RELEASE_ID" =~ ^[a-f0-9]{16}$ ]]; then echo 'Invalid reviewed release ID' >&2; exit 2; fi
compose=(docker compose -f "$(dirname "$0")/compose.yaml")
"${compose[@]}" config --quiet
stamp=$(date -u +%Y%m%dT%H%M%SZ)
"${compose[@]}" exec -T app python scripts/community_storage.py --backup "$AYO_BACKUP_DIR/pre-rollback-$stamp.sqlite.enc" --encrypt-backup
"${compose[@]}" up -d --no-build --pull never --wait
"${compose[@]}" exec -T app python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready').close()"
echo 'Previous services started. State was preserved; verify moderation and journeys before reopening traffic.'
