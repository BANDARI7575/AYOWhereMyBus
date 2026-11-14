# Phase A — verified backup and pre-migration baseline

Date: November 13, 2026. Branch: `release/integrated-transit`.

Scope: Phase A only. No application repairs, file moves, renames, deletions,
dependency installations, server restarts, commits, pushes or deployments.
Phase B requires the user's next approval. This report is the only repository
file added during Phase A; existing uncommitted work is preserved.

## Backup and restore verification

Private local backup:

`/Users/bandariabhi/Desktop/AYOWhereMyBus-backups/phase-a-20261113T235149Z/`

| Artifact | Contents / verification |
| --- | --- |
| `working-tree.tar.gz` | 192 files, including tracked modifications, untracked source/tests, GTFS CSVs, legacy backups and the existing source ZIP |
| `manifest.json` | Per-file SHA-256, size/mode, archive hash, database snapshot hashes, exclusions and limitations |
| `restore-check/` | All 192 archived files restored into an isolated directory and individually hash-verified; nothing restored over the live project |
| `history.bundle` | Git history and references; `git bundle verify` passed |
| `metadata/` | Original branch, HEAD, Git status, staged/unstaged binary patches and bundle verification |
| `databases/schedule.sqlite` | SQLite online backup; full `PRAGMA integrity_check` returned `ok` |
| `databases/community.sqlite` | SQLite online backup; full `PRAGMA integrity_check` returned `ok` |
| `evidence/` | Phase A inventories, raw test logs, browser probes, API snapshots and this report |

Source archive SHA-256:

`e8974b9be7cad2e79598476ff415742ec5a8bf50ef41eabe7a7ad47716292307`

The backup and its parent directory have mode `0700`; backup metadata,
archives and database files have mode `0600`. It contains private local data
and history and must not be published or added to Git.

SQLite's online backup API captured committed database state without raw-copying
active database/WAL files. Snapshots are independently consistent, not an atomic
transaction across both databases. The live databases were never restored or
modified by the backup operation.

Dependencies, virtual environments, caches and live credential files are excluded;
dependency lockfiles and `.env.example` are retained. Browser/Safari/PWA storage
and external secrets are not backed up. This is a verified local backup, not an
off-device disaster-recovery copy. Test restores must use a new directory and
verify the manifest before any intentional restoration over working files.

## Preserved working tree

At capture: **28 modified tracked files and 19 untracked files**.
The exact list and original commit are in `metadata/`.

After all tests, every archived working-tree file still matched its captured
SHA-256 and Git status matched the captured status. The baseline report was
added only after this check. No existing file was changed to make tests pass.

## Running application baseline

| Port | Process | Started | Startup source revision |
| --- | --- | --- | --- |
| 5000 | PID 11970, `python app.py` | November 11 | `894e8d659033` |
| 5001 | PID 28227, Flask CLI using `--app app` | November 13 | `5d3333b5a787` |

Both working directories are this repository. Port **5001** was selected for
Phase A browser/API verification because its captured startup revision matches
the current disk revision, `5d3333b5a787`. Both existing servers were left running
and untouched; neither was restarted or reconfigured.

The older process's revision includes static assets as well as Python, so the
revision difference alone does not identify which loaded Python functions differ.
It is unsuitable as a certified baseline for the current backend.

On port 5001, homepage HTML, `/static/app.js` and `/sw.js` matched disk SHA-256
hashes and were served with `Cache-Control: no-cache`. API responses inspected
used `Cache-Control: no-store`.

## Contracts to preserve during Phase B

`evidence/contracts.json` records **33 route rules**, methods and endpoints,
including static assets, service worker, realtime buses, stops, journeys, agent
tools, alerts, community reports, moderation, readiness and push APIs. Generating
this inventory imported the application with an isolated temporary community
database path, not the rider database.

It also records all **12 loaded scripts**, syntax checks, npm commands and
default data paths. All **14 top-level static JavaScript files** passed
`node --check`.

Preserve:

- One Flask application and compatible `python app.py`, `flask --app app`, and
  Gunicorn `app:app` entry points. The alert sender remains a separate worker.
- Existing `/api/`, `/static/`, homepage and `/sw.js` contracts.
- `GTFS_DIR` / `google_transit`, `SCHEDULE_DB` / `instance/schedule.sqlite`, and
  `COMMUNITY_DB` / `instance/community.sqlite` resolution.
- Local-storage keys `ayo-favorites`, `ayo-stops`, `ayo-workspace-favorites`,
  `ayo-language` and `ayo-day-mode`; session keys `ayo-view-state` and
  `ayo-workspace-context`. Do not rename, erase or silently migrate them.
- Prediction freshness/cancellation/uncertainty safeguards, explicit walking
  opt-in, itinerary expiry, authentication and spending gates, moderation and
  protected persistent data.

Ports and hostnames are different browser origins. Testing port 5001 does not
copy or erase favorites from port 5000, Safari or an installed iPhone PWA.
All browser tests used new isolated profiles and fixtures where specified.

## Tests executed and actual results

| Check | Result | Scope |
| --- | --- | --- |
| `npm test` | **23 passed** | Existing Node tests |
| Python unittest discovery with `-B` | **105 passed** | Existing backend/GTFS/security/persistence tests; isolated test data |
| `tests/redesign.browser.cjs`, accessibility enabled | **12 scenarios passed** | Chrome/WebKit, English/Spanish, widths 320/390/1440, controlled API fixtures |
| Accessibility in those scenarios | **120 scans; no detected violations** | Five screens, both themes; not physical screen-reader certification |
| `tests/redesign-advanced.browser.cjs` | **Both engines passed** | Denied GPS/manual fallback, mock readout/notifications, prediction-only triggers/deduplication, blocked paid/background setup, saved rename/reorder/remove/reload, itinerary expiry |
| `tests/weather.browser.cjs` | **168 condition cases + 12 cold-load failures passed** | Both engines, six widths, zero/negative temperatures, icons, stale and unavailable data |
| `tests/redesign-pwa.browser.cjs` | **Both engines passed** | v24 cache, API exclusion, offline navigation and honest unavailable data |
| Read-only live browser probe | **Both engines passed stated checks** | Typed Route 19 helper answered; live paid voice reported blocked; active v24 worker; no uncaught page errors |
| Existing `tests/journey.live.browser.cjs` | **FAILED** | Desktop layout assertion at line 74 expects 2 grid columns; current planner has 3. Earlier assertions received/rendered a real journey. Suite did not complete remaining scenarios. |
| Known-defect browser probe | **Defects reproduced in both engines** | Route-filter handoff and error-to-zero alerts; not passing product acceptance |

Do not describe the entire baseline as green. Several npm aliases execute the
same suite: browser/map/controls/utility share one command, and
features/workspaces/workspace-failures share another. The baseline runs distinct
suites once rather than claiming each alias adds independent coverage. Not every
retained historical browser suite was executed or passes the current design.

Read-only live API checks all returned **HTTP 200**: health, schedule status,
Route 19 vehicles, route catalog, Wisconsin stop search, stop 416 departures,
service alerts, Route 19 shapes, a 416→417 journey, community report listing and
agent configuration. Observed counts were 8 Route 19 buses, 49 routes, 50 search
results, 8 departures, 8 alerts, 14 shape entries and one journey leg. These are
timestamped snapshots in `evidence/live-api.json`, not future guarantees. No
reports, subscriptions or alerts were created against rider data.

## Known defects and incomplete features — unchanged

1. **Journey → map:** a Route 30 fixture itinerary opened the map with two
   polylines, but the vehicle filter and label remained Route 19 in both engines.
2. **Alert error state:** a failed refresh changed the display from one alert to
   zero while the cached successful snapshot still held one. Both engines
   reproduced it. Independent snapshot/filter paths remain.
3. **Zero-minute source data:** for November 13 at 17:02, trip `37805271`, Route
   30 direction 1, stops 416→417, sequences 27→28 publishes the same 17:03:00
   timestamp, yielding zero seconds. Reverse trip `37805267`, stops 4339→4340,
   sequences 42→43, is 17:10→17:11, yielding 60 seconds. Service time
   23:59:30→24:00:15 yields 45 seconds. Original historical iPhone trip remains
   unconfirmed without its date/trip ID. No fabricated duration was introduced.
4. Animated divider bus, permanent floating Voice shortcut and complete founder
   profile are absent. They remain later-phase work.
5. Typed transit assistance exists; paid live AI remains disabled. No actual
   microphone/provider session or audible device acceptance was performed.
6. GPS callbacks/manual fallback exist; trusted iPhone HTTPS and distinct error
   handling remain Phase D work. Loopback secure-context success is not iPhone
   LAN-HTTP acceptance.
7. Neither clock element exists in the current page, although guarded clock
   JavaScript remains. This unresolved prior requirement conflict is recorded,
   not silently changed during cleanup.

No defects were repaired and no missing features were implemented in Phase A.

## Evidence and approval boundary

Raw evidence is preserved privately under the backup's `evidence/` directory:
test logs, responsive/accessibility and weather JSON, API/route inventories,
GTFS evidence, and temporary read-only browser probe scripts/results. The
approved prior audit and Phase A backup script are retained for provenance.

Still unverified: actual Safari profile/update state, physical iPhone GPS and
microphone permissions, native audible voice, background push delivery,
installed-PWA persistence, remote CI and production operation. No dependencies
were installed and no production configuration was changed.

**Phase A is complete as a captured baseline with documented failures. Stop here.
Phase B reorganization requires the user's next approval.** Final goals remain
professional organization, working GPS and AYO Voice, divider-bus animation and
About the Founder, while preserving existing working functionality.
