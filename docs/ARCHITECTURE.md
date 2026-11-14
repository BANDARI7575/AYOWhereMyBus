# Architecture

AYO is a Flask application with browser-native JavaScript and one Leaflet map.
There is no application JavaScript compilation step. The root `app.py` remains the
compatible Flask/Gunicorn launcher, exporting the application from `backend.app`.

## Backend boundaries

`backend/app.py` constructs Flask, serves the homepage/privacy templates and
vehicle endpoints, and registers the integrated API layer. `backend/release_api.py`
composes schedule, realtime, rider, moderation and push services, request limits,
security headers, readiness and source-revision reporting. Services do not import
the composed Flask app.

| Module under `backend/services/` | Responsibility |
| --- | --- |
| `transit_engine.py` | Indexed GTFS, calendars, agency-local service days, departures and bounded journeys. |
| `stops_service.py` | Official CSV stop discovery and straight-line distances. |
| `routes_service.py` | Routes and directions serving an official stop. |
| `realtime_service.py` | Conservative trip-update matching and official alerts. |
| `feed_http.py` | Bounded, verified upstream HTTP transport. |
| `alert_service.py` | Shared alert snapshots and route relevance. |
| `feature_service.py` | Stop/route discovery and validated transit helper tools. |
| `moderation_service.py` | Named reviewer access, queues and abuse/report handling. |
| `push_service.py` | Encrypted subscriptions, qualified prediction delivery and configuration validation. |

`backend/paths.py` anchors defaults to the repository root. Default GTFS is
`data/google_transit`; the historical export `data/buses.json` is not used as live
tracking data. The existing schedule and community SQLite paths remain in
`instance/`. Environment overrides select operator-managed sources/stores.
Prefer absolute override paths; no storage migration or schema change is required
by source restructuring.

## Data and calculation boundaries

Official GTFS supplies stops, trips, directions, stop sequences, shapes and service
coverage. Realtime supplies reported vehicle positions, qualified trip predictions
and disruptions. Missing/stale realtime data does not become an invented ETA.
Weather has its own observation time and last-good/unavailable state.

GTFS times use America/Chicago service-day semantics, including extended hours and
DST handling. Journeys use exact selected stop IDs and preserve calendar, minimum
transfer and detour policies. Search is bounded to two rides, four incoming-trip
labels per stop and an eight-second computation budget. Ranking preferences and
no-route outcomes are not a guarantee of global optimality or no other service.

Walking is explicit opt-in, estimated straight-line access/transfer/egress; no
pedestrian path, crossing safety or accessibility is inferred. Shapes use source
distances when compatible, otherwise disclose a full-trip fallback. Distinct stops
published in the same minute retain their source elapsed value with an honest
precision label. Backend measurements remain metric where calculations/APIs need
them; the interface displays miles, feet and mph through `static/js/units.js`.

The community database persists moderated reports, protected subscriptions,
request/admission counters and operational state. It must not be copied live
without SQLite's backup API. Candidate GTFS indexes are built separately; startup
never silently rebuilds an active timetable.

## Browser structure

Flask's explicit `templates/` folder holds `index.html` and `privacy.html`.
Application code lives in `static/js/`, styles in `static/css/`, icons/retained
artwork in `static/img/`. Vendor libraries/fonts/licenses stay in `static/vendor/`;
the translation catalog stays at `static/es.json`.

- `navigation.js` manages the Stops, Map, Trip, Alerts, Saved and supporting views,
  history positions and menu controls.
- `app.js` owns the live vehicle/map state; `journey.js` owns the scheduled planner.
- `workspaces.js` reuses the map/planner in rider dialogs and maintains typed/native
  Voice, saved stops, arrival watches and data-freshness controls.
- `rider-tools.js`, `transit-ui.js` and `alert-store.js` share arrival rendering,
  source semantics and alert snapshots.
- `location-access.js` and `location-search.js` centralize permission/errors and
  official boarding-stop selection. Location is requested by a user action.
- `home-experience.js` controls the divider bus and floating Voice shortcut, with
  visibility, reduced-motion, modal and keyboard behavior.
- `weather.js`, `i18n.js` and `pwa.js` handle their named responsibilities.
- `stops-ui.js` is retained older source, not loaded by the current homepage.

The layout, controls, Founder content, weather behavior and transit algorithms
were not redesigned during restructuring.

## HTTP and compatibility

All existing API paths and methods remain. Discovery/planning endpoints include
`/api/buses`, `/api/stops/nearby`, `/api/stops/search`, stop routes/departures,
`/api/journeys`, `/api/journey-locations`, route shapes, service alerts and
`/api/explore/*`. Validated helper, moderation, reports and push endpoints retain
their validation/authentication/rate boundaries. `/api/health` is process liveness;
`/api/ready` has stronger storage/calendar/worker checks.

Canonical frontend URLs reflect the new directories. `backend.app.LEGACY_ASSETS`
is a fixed allowlist mapping old asset names to the same canonical files so old
open tabs can finish an update. No duplicate source copies or general repository
file server are introduced. `/static/privacy.html` remains a template response;
templates, backend modules, databases and secrets are not exposed as files.

## PWA and preferences

`static/sw.js` is still served at `/sw.js` with no-cache and root scope permission.
Both manifests retain their locations, ID, start URL and scope. Their icon URLs
now use `static/img/`. The shell namespace changes from v26 to v27; activation uses
the existing update flow. Shell fetches refresh successful online files before
falling back offline. API responses are never cached as live transit data.

Language, theme, route/stop favorites and saved journey storage keys are unchanged.
HTTP and HTTPS are different origins; no implicit cross-origin storage migration
is attempted. Old-shell upgrade and offline navigation have dedicated browser
coverage using preserved baseline fixtures, not a personal browser profile.

## Speech, security and operations

Typed questions resolve supported requests through allowlisted transit tools.
Optional browser recognition and speech synthesis require browser support and
permission; recognition may use the browser vendor's remote service. Paid AI
conversation remains separately disabled/gated by credentials, authentication,
spending safeguards and owner acceptance. No account/provider service is enabled
by reorganizing files.

Production retains the single-node Gunicorn/SQLite profile, trusted ingress,
security headers, private persistent storage and protected operations. Consult
[deployment](DEPLOYMENT.md), [the runbook](RUNBOOK.md) and
[iPhone testing](IPHONE_TESTING.md). Historical investigations remain in
`docs/archive/`, and older source/test copies remain in `archive/legacy/`.
