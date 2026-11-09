#!/usr/bin/env bash
# Operator-only, explicit apply. Never called automatically by the development agent.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'No deployment performed. After approval: release.sh --apply [--first-install]'
  exit 0
fi
: "${AYO_RELEASE_ID:?set the reviewed release ID}"
: "${AYO_ENV_FILE:?set protected production env path}"
: "${CADDY_IMAGE:?set tested immutable Caddy image digest}"
: "${AYO_BACKUP_DIR:?set protected in-container backup directory on persistent storage}"
if [[ ! "$AYO_RELEASE_ID" =~ ^[a-f0-9]{16}$ ]]; then echo 'Invalid reviewed release ID' >&2; exit 2; fi
compose=(docker compose -f "$(dirname "$0")/compose.yaml")
"${compose[@]}" config --quiet
if [[ "${2:-}" != "--first-install" ]]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  "${compose[@]}" exec -T app python scripts/community_storage.py --backup "$AYO_BACKUP_DIR/pre-release-$stamp.sqlite.enc" --encrypt-backup
fi
"${compose[@]}" up -d --build --wait
"${compose[@]}" exec -T app python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready').close()"
echo 'Services started. Verify public TLS, real journeys, monitoring and device checks before opening rider traffic.'
