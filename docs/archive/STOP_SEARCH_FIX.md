# Wisconsin stop-search failure: root cause and verification

November 9, 2026, existing `release/integrated-transit` workspace. Nothing pushed or deployed.

## Root cause

Port 5050 was running PID 47606, started at **08:45:35 America/Chicago**, from this workspace with:

```
python -m flask --app app run --host 127.0.0.1 --port 5050
```

It had no auto-reloader. The planner API in `release_api.py` was updated at **08:49:36**, and `static/journey.js` at **08:59:18**. Flask read the updated static JavaScript from disk, while its already-imported Python backend retained the old route table.

Observed before the fix:

- `GET /api/journey-locations?q=Wisconsin` returned **404 HTML** on port 5050.
- `/api/status` still returned **200**, with valid schedule coverage, proving that general server health did not establish planner capability.
- Headless Chrome reproduced the precise browser request and the same “Stop search is unavailable. Check your connection and try again.” message.
- The old process's stdout/stderr pointed to `/dev/ttys093`, with no retained log file. Historical terminal output was not read; the HTTP response, process start time and browser request established the failure. The replacement server's actual request logs were inspected and showed successful searches and journeys.

This was a stale backend/new frontend mismatch, not a missing GTFS database or a Safari-specific search failure. No schedule index rebuild or user-data deletion was needed.

## Fix

- Restarted the identified stale local process on the same **127.0.0.1:5050** origin with current project code.
- Added `scripts/dev_server.py`: loopback-only, Python auto-reload enabled, interactive debugger disabled. Production Gunicorn settings remain separate.
- `/api/health` now reports `planner_api_version`, `source_revision` and `started_at`; responses include `X-AYO-Revision`. The revision is captured at process startup, rather than re-reading a source hash for every request.
- Stop-search errors now distinguish missing API (404), rate limiting (429), unavailable/malformed stop data and connection failures. On localhost, missing API guidance explicitly says to restart with the current project code and reload. Public visitors get a reload/official-planner fallback instead of developer instructions. Diagnostic warnings log status/code, without recording location query coordinates.
- Added an **unmocked** GTFS/browser integration test so a running stale server cannot pass simply because mocked UI contracts or an in-process Flask test client work.

Restart local development with:

```sh
.venv/bin/python scripts/dev_server.py --port 5050
```

The updated server was left running for the rider's Safari retest. Reload http://127.0.0.1:5050/ normally. Clearing favorites, location permissions, databases or browser storage is not required; the service worker does not cache API responses.

## Actual results

- After restart, the Wisconsin search returned **200** with ten official GTFS suggestions.
- **29 backend unittest executions passed.**
- **6 frontend Node unit tests passed**, including missing-local-API, public missing-API, rate-limit and stop-data error messages.
- Existing **53 grouped browser regression checks passed**, including location, no-route, failures, stale responses, keyboard selection, walking labels, Spanish and responsive behavior.
- **Six unmocked end-to-end journeys passed:** Chrome and Playwright WebKit at **1440px, 390px and 320px**. Each typed “Wisconsin” into From, keyboard-selected **WISCONSIN & CASS** (internal ID 2783), searched and keyboard-selected **JUNEAU & DR. MLK DRIVE** (1603) in To, and received a scheduled **Route 33** journey from the real local API and imported GTFS. In this run, departure was **09:17** and arrival **09:24 Milwaukee time**, a seven-minute scheduled ride. These are test-run observations, not current predictions.
- Both fields also returned graceful real empty results for a nonexistent stop. All search responses in the unmocked runs were **200**; journey responses were **200**. No page JavaScript exceptions or horizontal overflow occurred in those runs. The map used real Leaflet locally; third-party weather/fonts/tiles were blocked for repeatable browser checks. Planner APIs were not intercepted.
- Source revision during verification: `ce7c02e46e4f`. Machine-readable evidence: `qa/stop-search-live-verification.json`.
- Syntax, Python compilation and Git whitespace checks passed.

Playwright WebKit tests Safari's browser-engine family; they are not a test inside the user's Safari application/profile or an iPhone. The stale process was reproduced independently of Safari, and fixed at the shared server.

## Reproduce

With dependencies from package-lock.json installed and the local server running:

```sh
.venv/bin/python -m unittest discover -s tests -v
npm test
npx playwright install chromium webkit
AYO_TEST_URL=http://127.0.0.1:5050 npm run test:live
```

Optional `AYO_CHROME_PATH` selects installed Chrome, `AYO_BROWSER=webkit` or `chromium` selects one engine, and `AYO_PYTHON` selects the Python interpreter. The live test discovers an actual scheduled downstream stop from the imported GTFS at test time. If that feed has no covered service, it fails explicitly instead of substituting synthetic arrivals. The existing deterministic `npm run test:browser` remains useful outside feed coverage.

Remaining production constraints (address geocoding, verified pedestrian routing/accessibility, bounded scheduled search, device/screen-reader testing and hosting operations) remain in JOURNEY_PLANNER.md and RELEASE.md. This fix does not change transit calculations or claim realtime journey feasibility.
