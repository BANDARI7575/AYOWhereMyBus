# Deletion candidates for separate owner review

**No deletion is authorized or performed.** Every item below remains in the
repository or its existing ignored location. Restructuring moves are recorded in
[the move manifest](RESTRUCTURE_MOVES.json); this document is not an execution list.

| Current location | Purpose/references | Recommendation before any deletion |
| --- | --- | --- |
| `AYO_Full_Source.zip` (ignored, repository root) | Original source snapshot, excluded from Git/Docker; no runtime reference found. | Keep until unique contents and a verified independent backup are checked. |
| `scripts/examples/arrival_basics.py` (former `main1.py`) | Hardcoded learning example, not an application import; historical move records reference it. | Keep unless owner decides learning material is unwanted. |
| `scripts/tools/export_vehicle_snapshot.py` (former `bus_tracker.py`) | Optional live-feed export utility; now writes `data/buses.json`. | Keep useful tool; not a duplicate Flask server. |
| `scripts/tools/browse_vehicle_feed.py` (former `read_buses.py`) | Optional interactive route-feed browser. | Keep useful CLI; no runtime import does not establish it is unused by operators. |
| `data/buses.json` | Historical export, not live tracking input; exporter writes it. | Keep unless owner approves losing the snapshot. |
| `static/js/stops-ui.js` | Older nearby-stop module, not loaded by current HTML/precache; historical references exist. | Potential dead module; retain pending API-consumer/operator review and explicit approval. |
| `static/img/milwaukee-cinematic.png`, `static/img/milwaukee-cinematic.svg` | Unreferenced current artwork; different formats, not byte-identical duplicates. | Keep both until owner approves removing original artwork. |
| `archive/legacy/routes_service.backup.py`, `archive/legacy/stops-ui.backup.js` | Historical implementations, excluded from production image. | Keep source history; future deletion needs explicit approval. |
| `archive/legacy/auto_push.sh` | Unsafe old automatic stage/commit/push utility, excluded from runtime. | Keep as inert history; never execute. Deletion requires approval. |
| `archive/legacy/tests/frontend/` | Six old browser scripts and two pre-migration snapshots; provenance references in archived reports. | Keep; these are not active passing tests. No cleanup as part of this refactor. |
| `archive/legacy/README.md` and remaining `archive/` content | Archive provenance and original historical material. | Keep the entire archive unchanged. |
| `docs/archive/PHASE_A_BASELINE.md`, `PHASE_B_ORGANIZATION.md`, `PHASE_B_CHANGES.json`, `PHASE_B_MOVES.json`, `EXECUTION_PROGRESS.md` | Backup, move and prior status receipts. | Keep archived; remove artificial milestone labels only from current primary documentation. |
| `docs/archive/MAP_LAYOUT_FIX.md`, `STOP_SEARCH_FIX.md`, `AUDIT.md`, `INTEGRATED_AUDIT.md`, `RELEASE.md`, `REDESIGN_PLAN.md`, `FEATURE_WORKSPACES_PLAN.md`, `FEATURE_WORKSPACES_RELEASE.md` | Historical diagnoses, implementation plans and releases; useful but not current operating instructions. | Keep archived. Consolidation is not approval to discard originals. |
| `docs/archive/IMPLEMENTATION_REPORT.md`, `IMPLEMENTATION_CHANGES.json`, `BROWSER_TEST_MIGRATION.md`, `BROWSER_TEST_MIGRATION.json`, `LAUNCH_READINESS.md`, `PRODUCTION_LAUNCH_CHECKLIST.md`, `JOURNEY_PLANNER.md`, `INDEX.md`, `archive-audit.json`, `live-verification.json` | Previous implementation, test, architecture and acceptance receipts. | Keep; current primary docs separate verified behavior from historical claims. |
| `docs/archive/qa/` (37 files) | Historical QA, dependency, feed, performance, HTTPS and asset receipts; exact paths in move manifest. | Keep all 37 contents unchanged. |
| `docs/archive/README.before-restructure.md`, `DEPLOYMENT.before-restructure.md`, `RUNBOOK.before-restructure.md` | Exact originals preserved before rewriting primary docs. | Keep; useful rollback/reference material. |
| `requirements.lock` | Exact runtime pins used by Docker, CI and packaging. | Keep; not redundant with `requirements.txt`. |
| `requirements.txt`, `package.json`, `package-lock.json` | Direct dependency declarations and reproducible frontend tooling. | Keep. |
| `static/img/icon-192.png`, `icon-512.png`, `icons.svg` | Active install/browser/UI assets with distinct purposes. | Keep all, not duplicate cleanup candidates. |
| `static/vendor/fonts/`, `static/vendor/leaflet/` | Fonts, map library, source map, marker images and licenses; font declarations still refer to older families. | Keep complete vendor trees and licenses. |
| `scripts/ops/`, `scripts/gtfs/`, `scripts/dev/`, `scripts/tools/` | Backup/restore, monitoring, moderation, alert sender, startup, packaging, data and local TLS utilities. | Preserve all; manual scripts may be useful without application imports. |
| `tests/` and `tests/fixtures/` | Active regressions and isolated inputs, including old-shell upgrade fixtures. | Preserve all; old URLs in upgrade fixtures are intentional. |
| `.venv/`, `node_modules/`, `__pycache__/` | Ignored local dependencies/caches; none tracked at baseline. | No tracked cleanup needed. Do not remove installed environments in this task. |
| `instance/` including SQLite, WAL/SHM and TLS keys/certificates | Private live state, not source clutter; none tracked at baseline. | Preserve paths, data and keys. Never delete WAL/SHM as arbitrary temporary files. |
| `.git/`, root launch/config files, `deploy/`, `.github/`, `.vscode/` | Git history, application entry points, configuration, CI/deployment and editor integration. | Keep; only reviewed path references change. |

An asset SHA-256 scan found no byte-identical PNG/SVG/WOFF2 groups. Visual
similarity alone is not proof a file is safe to remove. External operator usage
cannot be ruled out from repository references alone. Any later deletion needs
an explicit owner-approved file list and verified recovery path.
