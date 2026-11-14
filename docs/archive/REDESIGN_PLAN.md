# Utility-first redesign — implementation plan

Approved November 13, 2026. Work remains on `release/integrated-transit`; no commit, push, deployment, credential activation, user-record mutation or timetable replacement is authorized.

1. Preserve the dirty working tree. Source baseline (122 files, excluding secrets, databases and binaries) is `/private/tmp/ayo-redesign-baseline-20261113/source-before-redesign.zip`, with SHA-256 inventory beside it. It includes the prior clock, units, SVG and focus fixes.
2. Reuse Flask `app.py`, `release_api.py`, `feature_service.py`, local `Schedule`, GTFS-RT `Realtime`, Leaflet, favorites, notifications and service worker. Keep production validation, feed ingestion, directional matching and community storage intact.
3. Replace cinematic HTML/CSS with five accessible destinations: Stops, Map, Trip, Alerts and Saved. Keep the existing planner and one map. Put stop search/arrivals and route controls first. Remove decorative clocks, image requests, bats and marketing from the main UI.
4. Add shared safe alert/arrival presentation, current-route chips validated against the GTFS catalog, reliable selected-stop refresh, tab/online tracking recovery, language screen/scroll restoration and clear weather availability.
5. Preserve Winter Watch implementation behind a hidden public panel. Retain its backend/data/moderation. Document re-enablement and remaining operational requirements. Investigate map/geocoding providers; do not activate paid or privacy-sensitive external integrations.
6. Test deterministic data and real schedule contracts separately; run Chromium/WebKit mobile/desktop, dark/light, keyboard/accessibility, offline and polling checks. Measure resources against the captured baseline. Record obsolete cinematic UI assertions separately from applicable regressions.

## Inspection / baseline

Flask serves static HTML/JS and APIs; the frontend currently mounts separate rider tools and six dialog workspaces, relocating the existing map/planner. Favorites are local browser data. Schedule SQLite is read-only during requests. Community SQLite, moderation and encrypted push watches remain operationally gated. PWA is network-first for shell resources, never API-cached. Address geocoding is absent; route/stop discovery is local GTFS. Weather already requests Fahrenheit/mph.

Baseline: 19 Node tests passed; 103/104 Python tests passed. The failing journey-cache test injects a November 10 itinerary but compares its expiry against the real clock; fix the test clock, not the backend expiry safeguard. Existing UI suites encode cinematic headings, bats, duplicate clocks and public Winter Watch; update applicable contracts to the approved design rather than retain removed UI solely for tests.

Verified local route IDs: BLU, PUR, GRE, 19, 21. Provider research: retain OSM tiles; CARTO now requires a key. No approved address provider/key exists. See REDESIGN_REPORT.md for implementation and final evidence.
