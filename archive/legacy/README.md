# Preserved legacy sources

These files were moved without deletion during Phase B. They are not imported by the active application or included in the production image.

- `routes_service.backup.py`: historical route lookup implementation; original relative paths are historical and not updated for execution here.
- `stops-ui.backup.js`: historical nearby-stops frontend copy, not loaded by current HTML.
- `auto_push.sh`: UNSAFE historical utility that stages, commits and pushes automatically. Do not run it. Retained for history only.

See `docs/PHASE_B_MOVES.json` for original locations. The unused-but-unreviewed `static/stops-ui.js` and cinematic assets remain in place. No archived file is a replacement for the verified Phase A backup.

## Historical browser tests

Six pre-redesign browser scripts are preserved unchanged under `tests/frontend/`.
Two additional `.before-migration` files preserve the exact tests before current-interface edits.
See [disposition and coverage limits](../../docs/BROWSER_TEST_MIGRATION.md) and
[exact moves](../../docs/BROWSER_TEST_MIGRATION.json). They are forensic copies,
not active test commands; relative imports assume their former locations.
