# Phase B — professional codebase organization

November 13, 2026 · `release/integrated-transit` · Phase C not started.

Phase B reorganized existing code only. No website design changes, new UI
features, transit repairs, dependency installations, commits, pushes or deployments.
The verified Phase A backup remains unchanged at:

`/Users/bandariabhi/Desktop/AYOWhereMyBus-backups/phase-a-20261113T235149Z/`

## Structure

```text
AYOWhereMyBus/
├── app.py                       compatible Flask/Gunicorn launcher
├── backend/
│   ├── app.py                   sole Flask application construction
│   ├── paths.py                 stable repository root
│   ├── release_api.py           integrated APIs, persistence, guards
│   ├── feature_service.py       rider tools and voice boundaries
│   ├── transit_engine.py        GTFS scheduling and journeys
│   ├── realtime_service.py      predictions and alerts
│   ├── feed_http.py             bounded feed downloads
│   ├── stops_service.py
│   ├── routes_service.py
│   ├── push_service.py
│   └── moderation_service.py
├── index.html
├── static/
│   ├── app.js, journey.js, workspaces.js
│   ├── weather.js, rider-tools.js, navigation.js, pwa.js
│   ├── units.js, transit-ui.js, location-search.js, i18n.js
│   └── style.css, icons, translations, manifests, sw.js, vendor/
├── tests/
│   ├── backend/                 Python tests
│   ├── frontend/                Node/browser tests
│   └── fixtures/                shared JSON fixtures
├── scripts/
│   ├── examples/arrival_basics.py
│   ├── tools/export_vehicle_snapshot.py
│   ├── tools/browse_vehicle_feed.py
│   └── existing operational scripts
├── archive/legacy/              preserved backup copies and auto-push script
├── google_transit/              unchanged required data
├── instance/                    unchanged ignored runtime data
├── docs/                        index, operations, dated QA reports
├── deploy/                      existing deployment configuration
├── .github/workflows/
└── gunicorn.conf.py, Dockerfile, .env.example, dependency manifests
```

No extra frontend/config wrapper was created. Flask's conventional `static/`
URLs remain, deployment settings stay in `deploy/` and standard root files.
Historical documentation and evidence retain their original paths and dates;
`docs/INDEX.md` distinguishes them from current organization reports.

## Exact moves and other changes

[PHASE_B_MOVES.json](PHASE_B_MOVES.json) records all **55 moves**:

- Ten implementation modules moved into `backend/`.
- Four frontend modules renamed: `ayo-enhancements.js → weather.js`,
  `release.js → rider-tools.js`, `site.js → navigation.js`,
  `platform.js → pwa.js`.
- Seven existing Python test files moved into `tests/backend/`.
- All 28 existing CJS test/helper files moved into `tests/frontend/`.
- Three standalone scripts moved to examples/tools.
- Three obsolete/unsafe copies archived, never executed.

[PHASE_B_CHANGES.json](PHASE_B_CHANGES.json) inventories every relocated,
modified and new file relative to Phase A, with hashes where applicable. Git may
show old tracked paths as deleted and new paths as untracked until the changes
are staged; no staging was performed. Every original file is accounted for at
its original or documented destination. No source file was discarded.

Changes supporting the moves:

- Root `app.py` exposes the same Flask object for `python app.py`, Flask CLI and
  Gunicorn `app:app`. `backend/app.py` no longer has a separate script-start block.
- Backend imports, lazy imports, test mock targets, operational scripts and CI
  reference the package. Package-aware Python discovery uses `-t .`.
- Central `PROJECT_ROOT` anchors homepage/static paths, default GTFS/database
  paths and source fingerprinting; fingerprints now include `backend/`.
- Flask explicitly serves the original `/static` route from repository assets.
- HTML, Node relative imports, shared fixture references, npm commands and CI
  static checks use the new paths. Existing test assertions were not weakened.
- Service-worker shell changes from v24 to **v25** and precaches the renamed
  modules. Storage keys and existing activation controls are unchanged.
- Release packaging includes `backend/`; archived sources are excluded from
  the Docker context. Gunicorn, Dockerfile, environment sample and deployment
  service settings were otherwise left unchanged.
- The moved vehicle-export tool targets the repository's existing `buses.json`
  explicitly rather than accidentally writing relative to its new source folder.
  It was not run. The historical snapshot remains unchanged.
- README and current operational examples were updated; archive documentation
  identifies the auto-push script as unsafe. Dated QA receipts were not rewritten.
- Four organization regression tests cover the launcher object, public assets,
  default data paths and complete precache inventory.

## Preservation checks

All **192 archived Phase A working-tree files** are accounted for, plus the
unchanged Phase A report added after that backup. The original backup's archive
and manifest are retained. No data was restored over the live project.

Compared with Phase A, `static/style.css`, core tracking/planner/workspace code,
translations, units, icons, Gunicorn configuration, Dockerfile and `.env.example`
retain their exact bytes. HTML differs only in the four script filenames.

All **33 route rules**, methods and endpoint names match Phase A. Static,
homepage, GTFS and schedule-database paths resolve to their original locations.
All Python sources and top-level frontend/CJS sources passed syntax checks.
The local source package contains the backend package and compatible launcher
and passed the existing release checksum verifier. Nothing was deployed.

## Phase A comparison

| Check | Phase A | Phase B |
| --- | --- | --- |
| Python | 105 passed | **109 passed**, including four new relocation tests |
| Node | 23 passed | **23 passed** |
| Responsive/bilingual Chrome + WebKit | 12 scenarios passed | **12 passed** at 320/390/1440px |
| Accessibility | 120 scans, no detected violations | **120 scans, no detected violations** |
| Advanced flows | Both engines passed | **Both passed**: denied GPS/manual fallback, readout adapters, prediction safeguards/deduplication, saved rename/reorder/remove/reload, itinerary expiry |
| Weather | 168 condition cases + 12 cold failures | **Same cases passed** |
| PWA/offline | Both engines passed, v24 | **Both passed, v25**, with renamed assets |
| Live journey suite | Failed expected 2 versus actual 3 columns | **Same failure** at relocated line 74 |
| Known transit defects | Stale route handoff; error-to-zero alerts | **Same defects reproduced in both engines** |
| API smoke | HTTP 200 | **HTTP 200** for 11 comparable read-only APIs and six homepage/asset paths |

Additional coverage: all **21 browser script files were executed**. Final
outcomes were **7 passed and 14 failed**. This is not an all-green test suite.
The maintained Phase A browser suites all passed. The additional passing scripts
are `journey.browser.cjs`, `routing-quality.browser.cjs` and
`workspaces.live.browser.cjs`.

The live workspace suite initially received HTTP 429 when run concurrently with
other unmocked suites sharing a local request budget. It passed both engines
when rerun alone with a fresh isolated QA store. Limits and safeguards were not
changed. Both attempts are retained in the raw evidence.

Failed scripts:

- `journey.live.browser.cjs`: identical Phase A grid assertion (2 expected, 3 actual).
- `accessibility.browser.cjs`, `features.browser.cjs`, `full-release.browser.cjs`:
  expect planner controls visible without navigating to the Trip screen.
- `clock.browser.cjs`, `clock.live.browser.cjs`, `weather-time.browser.cjs`:
  expect clock elements absent from the Phase A/current page.
- `controls.browser.cjs`, `map-layout.browser.cjs`, `units.browser.cjs`:
  attempt controls outside the current visible view/menu.
- `svg.browser.cjs`: expects six historical decorative SVG instances; current count is zero.
- `homepage-scroll.browser.cjs`: expects no startup scroll calls at all, while
  navigation explicitly scrolls to top; current core checks still verify top position.
- `workspace-failures.browser.cjs`, `workspaces.browser.cjs`: wait for historical
  feature-card entry controls not present in the current HTML.

These historical suites were not all run in Phase A, so there is no claimed
before/after passing result for them. Their missing/hidden UI assumptions can be
seen in the unchanged Phase A markup. They were preserved and reported, not
silently skipped, deleted, or rewritten to conceal failures. No harness-level
100-second timeout was reached; failed scripts exited with their own assertions
or Playwright timeouts. Raw per-script outcomes and error logs are retained.

## Runtime and evidence

Tests used loopback port **5055** with isolated community databases, actual
read-only GTFS for unmocked cases, and fresh browser profiles. Rider reports,
subscriptions and browser storage in the user's existing profiles were not used
as test fixtures. Final fresh-import smoke checks identify revision
`9af8001120c2`. Existing development processes on ports 5000/5001 were not restarted.
They still hold pre-migration Python modules: **restart them before manually
using the reorganized application**. The Phase B-owned QA process is stopped
when verification completes.

Commands from repository root:

```sh
.venv/bin/python scripts/dev_server.py --port 5050
.venv/bin/python -B -m unittest discover -s tests -t .
npm test
AYO_TEST_URL=http://127.0.0.1:5050 npm run test:browser
```

Raw logs, JSON inventories, preservation checks and the verified local source
package are retained outside Git under the private Desktop backup parent, in
`phase-b-evidence-20261113/`. This report and the complete change/move inventories
remain in `docs/` for review. No dependency installation or remote CI run occurred.

## Remaining problems and next approval

Known map-filter handoff, alert-count/error handling and same-minute GTFS duration
presentation remain unfixed. The missing clocks and historical test-contract
mismatches remain recorded. Physical iPhone/Safari profile behavior, trusted HTTPS
GPS, real microphone/provider audio, installed-PWA persistence and native push
remain unverified. Paid Voice is still guarded/disabled. Founder profile, floating
Voice shortcut and divider-bus animation were not implemented in Phase B.

**Stop after Phase B. Wait for approval before Phase C.** Final goals remain
professional organization, functional GPS and Voice, the animated bus and founder
section while retaining existing working features. Production readiness is not
claimed by this reorganization or by local test passes.
