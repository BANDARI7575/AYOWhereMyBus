# Journey planner rider experience — November 9, 2026

Implemented on the existing `release/integrated-transit` branch. No push or deployment performed. All pre-existing working-tree changes and backup files were retained.

## Rider flow

Origin and destination are searchable official GTFS stop/intersection names. Suggestions are debounced, keyboard-operable (arrows, Enter, Escape), labeled for assistive technology, and limited to boarding-stop records. IDs are selected internally; typing or editing a name alone cannot submit a stale ID. Location permissions are requested only when a rider presses Use My Location. Location offers up to ten official stops within 1.5 km, ranked by straight-line distance. The rider must choose a stop; AYO does not assume the nearest stop is walkable or served in the desired direction. Device coordinates are not saved to favorites or the community database.

Search supports case-insensitive words in either order, e.g. `6th Wisconsin`. No address or landmark geocoder is configured. This is explicit beside the fields, with an official MCTS planner link for unsupported locations and broader searches. Empty matches, out-of-area coordinates, denied/unavailable location, failed requests, same-stop selections, no itinerary and search-budget failures each leave a useful next action. In-flight suggestion and journey results cannot replace a newer selection.

Journey results include official stop names, displayed route numbers (which can differ from route IDs), headsigns, boarding and alighting instructions, scheduled departure/arrival dates and times in America/Chicago, transfer waiting time, travel duration and initial wait. Duration is from departure at the chosen stop to final arrival and includes transfers. Reaching the first stop is excluded; if a walking connection is included, the total is clearly marked as including estimated walking time.

Walking connections show estimated distance/time and both stop names. They have no invented pedestrian geometry or accessibility claim. An external walking-directions link passes the actual GTFS stop coordinates to the external provider for independent checking.

The shared Leaflet map receives a separate journey layer containing the exact scheduled trip shapes referenced by the chosen bus legs and markers for boarding/alighting stops. Shapes may extend beyond the ridden segment; the legend says so. The bundled GTFS has no populated shape_dist_traveled values for reliable segment clipping, so AYO does not guess boundaries from nearest geometry points. No walking path is drawn. Changing the journey clears only its layer; live buses, nearby stops and other map features remain. A missing map or missing shape leaves the text itinerary usable.

The cinematic layout and creator content are retained. Controls stack at 650px and below. Narrow-screen header spacing was corrected after a real 320px overflow failure. English and Spanish planner controls and instructions are supported. The PWA shell version was advanced to cache the new planner script; transit APIs remain uncached.

## Implementation

- `static/journey.js`: dedicated planner UI; removed only the old stop-ID planner block from `static/release.js`.
- `GET /api/journey-locations?q=...` or `?lat=...&lon=...`: suggestions from the indexed GTFS stops, with explicit straight-line distance semantics.
- `GET /api/journeys?from=ID&to=ID`: same internal IDs and schedule engine; now adds stop objects, display route numbers, trip-specific shapes, durations, transfer count and `ok`/`no_route` status.
- `Schedule.plan`: retained calendar-aware search. Added trip metadata to its legs and snapshots between boarding rounds so a later improvement cannot accidentally exceed its two-ride bound. `Schedule.itinerary` enriches results without generating new transit times.
- Existing vehicle, departures, alerts, Winter Watch, weather, favorites and creator functionality remains in its existing modules.

## Actual validation

- **28 backend unittest executions passed** (includes inherited schedule regression cases). New coverage verifies names, display route numbers, transfer timing, totals, service-day behavior, named suggestions, proximity radius, invalid coordinates, same-stop/no-route cases, missing shapes and walking metadata without fabricated geometry.
- **4 Node frontend unit tests passed:** durations, Chicago dates across midnight, Spanish time labels and walking-link coordinates.
- **53 grouped headless-Chrome browser checks passed:** 1440×1000, 390×844 and 320×740 layouts; keyboard suggestions, internal-ID requests, readable times/transfers, actual Leaflet shape layers, creator preservation, no horizontal overflow, responsive stacking, editing invalidation, failed and empty searches, stale search and journey responses, successful/denied/out-of-area geolocation, walking estimate labels with no walking polylines, no-route and API errors, Spanish instructions and missing-map fallback. No page JavaScript exceptions were observed in the three primary viewport scenarios.
- Browser tests use synthetic GTFS fixtures generated through the schedule engine and intercepted only inside the test browser. External tile/weather/font requests are blocked; actual Leaflet 1.9.4 runs locally in QA. These are UI contract tests, not live transit predictions.
- Separately, an unmocked Flask API check using the bundled GTFS returned 10 Wisconsin suggestions and a scheduled **HALESCORNER & LOT → DOWNER & HAMPSHIRE** itinerary: Route 44U, 3,000-second ride, no transfer, 1,287 GTFS shape points, about **0.74 seconds** response time. This is one observed scheduled itinerary, not a promise of current service or general performance.
- JavaScript syntax and `git diff --check` passed. Desktop and mobile planner screenshots were inspected. Hosted CI configuration was updated but has not run on GitHub.

## Reproduce

Backend:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Frontend (pinned QA dependencies in package-lock.json; no production JS build required):

```sh
npm ci
npm test
npx playwright install chromium
.venv/bin/python -m flask --app app run --host 127.0.0.1 --port 5099
# In another terminal:
npm run test:browser
```

To use existing Chrome instead of downloading a Playwright browser, set AYO_CHROME_PATH to its executable. AYO_TEST_URL overrides the local test origin; AYO_QA_ARTIFACTS saves screenshots. Tests block service workers for deterministic checks. Actual PWA upgrade/installation is a separate device check. The local QA run used existing headless Chrome and dependencies in a temporary QA directory; it did not touch a personal browser profile.

## Remaining production blockers and limits

- Address/landmark search needs a suitable geocoding provider and its allowed autocomplete/usage configuration; current safe fallback is official stop-name search and the MCTS planner link.
- Verified pedestrian routing and accessibility need an appropriate routing/data source. Existing straight-line estimates cannot establish sidewalks, crossings, snow clearance, access paths or wheelchair feasibility. Total walking time is estimated, not an arrival prediction.
- The engine remains a bounded scheduled search: up to two rides, up to 100 upcoming departures per stop, two-hour boarding windows, estimated transfers and an eight-second budget. It does not guarantee globally optimal journeys, agency transfer-rule compliance or realtime disruption-aware feasibility. Riders are prompted to check service alerts.
- Shapes represent full scheduled trips, not a verified cropped ridden segment. Background push, full-site Spanish coverage, production hosting/TLS/ingress, moderation operations, schedule refresh, backups and load/abuse testing remain as described in RELEASE.md and DEPLOYMENT.md.
- Headless Chrome viewport checks do not replace Safari/iOS and Android device testing, a screen-reader audit, poor-GPS field trials, or real PWA/device notification validation. Map tile/CDN/weather outages and production geolocation permission behavior must be checked on the deployed host before public launch.

## Stop-search regression follow-up

The [stop-search root-cause report](STOP_SEARCH_FIX.md) documents the stale port-5050 process, its fix, and subsequent unmocked Chrome/WebKit journeys. Current totals are 29 backend tests, 6 frontend unit tests, 53 grouped UI regression checks and six real-GTFS browser journeys.
