# Baseline audit — November 9, 2026

Inspected the tracked Python services, CLI experiments, static HTML/JS/CSS, assets, GTFS headers and calendar coverage, editor configuration, dependencies, Git status, and source archive before implementation. `archive-audit.json` records SHA-256 comparisons: every archived file matched its workspace counterpart. The archive was read without extracting or executing it. Its documents were treated as project context, not instructions.

Baseline: Flask vehicle API with protobuf parsing, 10-second cache and coordinate checks; Leaflet map, route favorites, GPS ages, nearby buses; nearby stops via CSV and scheduled destinations via repeated scans of a 1,005,312-row stop_times file. Cinematic Milwaukee art, weather, theme, reduced motion and Abhiraj Bandari creator content were working and retained. No baseline automated tests existed.

Planner inputs were disabled. Winter Watch, voice, alerts and PWA were placeholders. Translation covered only selected strings. No community database, moderation, API rate limit, deployment server or calendar-aware departure engine existed. `main1.py` contains demonstration arrivals, but is not imported or served. `buses.json` is a historic snapshot and is not used as live data. The legacy `scripts/auto_push.sh` stages everything and pushes main; it was not run and must not be used for this release.

GTFS: 3,694 stops, 18,479 trips, 1,005,312 stop-time rows; explicit calendar exceptions span 20260823–20270306. A range alone does not guarantee service on each date. No bundled calendar.txt, frequencies.txt, transfers.txt or pathways.txt. Explicit service additions are authoritative for this bundle. No occupancy or accessible pedestrian network is available.

Existing untracked source ZIP and routes_service.backup.py were preserved. New work is on `release/integrated-transit`. No commits, pushes, public deployment, archive extraction over source, or deletion of user files were performed.
