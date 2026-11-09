> Superseded for production details by [PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md) and [LAUNCH_READINESS.md](LAUNCH_READINESS.md). The legacy command examples below are retained as historical setup context. Use the pinned lockfile and current production launcher.

# Run and operate AYO

## Local release

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -c 'from transit_engine import Schedule; Schedule().build()'
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/dev_server.py --port 5050
```

Open http://127.0.0.1:5050. This loopback-only development launcher reloads Python changes with the interactive debugger disabled. Production uses Gunicorn below. The environment example is documentation; Flask does not auto-load it. Export variables with your deployment secret manager. Set MODERATOR_TOKEN to a long random secret before accepting moderation work. Do not commit real secrets. Use the request routes below; never place moderator credentials in frontend JavaScript.

## Production target (requires owner approval to deploy)

Use a Python host or the provided Dockerfile, persistent writable `/app/instance`, HTTPS and a reverse proxy with one trusted ingress. Server command after building the index:

```sh
gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 4 --timeout 45 app:app
```

One worker keeps upstream polling cache shared; SQLite request budgets persist across restarts. Do not run independent replicas against separate community databases. Back up community.sqlite; the schedule index can be rebuilt. Configure ingress IP-based rate limiting, request limits and timeouts. The application deliberately does not trust arbitrary forwarded IP headers. All request.remote_addr values may be the proxy address unless the hosting ingress is configured appropriately; otherwise budgets are shared across riders. Terminate TLS at the ingress for PWA/location/notification support; confirm secure cookies and origin checks on that host.

Refresh official GTFS in a staging directory; validate source, build/test its index offline, then switch deployments during a maintenance window. Never overwrite an index being served. The bundled exception range ends March 6, 2027; actual service coverage must be checked independently. Restart to clear CSV/calendar caches after switching schedules. Check `/api/status`, `/api/health`, upstream timestamps, errors, storage, response latency and approved-report queue daily. `/api/health` is process liveness; `/api/status` checks local schedule coverage, not upstream readiness.

Confirm provider terms and attribution, map tile usage limits and weather terms for your expected traffic. URLs actually decoded in this session:

- https://realtime.ridemcts.com/gtfsrt/vehicles
- https://realtime.ridemcts.com/gtfsrt/trips
- https://realtime.ridemcts.com/gtfsrt/alerts

GTFS semantics: https://gtfs.org/documentation/realtime/reference/ and https://gtfs.org/documentation/schedule/reference/ . Recheck service-day/event alignment whenever schedule versions change.

## API summary

| Endpoint | Behavior |
| --- | --- |
| GET /api/buses?route=30 | GPS positions, timestamps, feed_fresh, age_seconds, reliability |
| GET /api/stops/nearby?lat=43.04&lon=-87.91 | Nearest official stops; straight-line distance |
| GET /api/stops/search?q=Wisconsin | Up to 50 name/ID matches |
| GET /api/stops/ID/routes | Scheduled routes, directions and destinations |
| GET /api/stops/ID/departures | Next two hours of scheduled departures, matched prediction if available |
| GET /api/routes/ROUTE/shape | All bundled shapes for route |
| GET /api/journeys?from=ID&to=ID | Named scheduled itinerary, trip geometry, transfer count and duration |
| GET /api/journey-locations?q=Wisconsin | Official boarding-stop name suggestions |
| GET /api/journey-locations?lat=43.04&lon=-87.91 | Nearby boarding-stop suggestions within 1.5 km; straight-line distances |
| GET /api/service-alerts | Fresh active official alerts, explicit unavailable status |
| GET /api/winter/reports | Approved, unexpired reports |
| POST /api/winter/reports | JSON stop_id and text; 202 pending |
| POST /api/winter/reports/ID/vote | JSON value: 1 or -1; anonymous browser vote |
| GET /api/moderation/reports | Pending queue; Authorization: Bearer TOKEN required |
| POST /api/moderation/reports/ID | JSON state: approved or rejected; same authentication |

All write bodies must be JSON objects. Current budgets per peer IP/minute: 120 reads, 12 writes. These are operational defaults, not a robust bot defense. Reports are text-only, 10–500 characters, no links or angle brackets. No media upload API exists. Reviewers should reject personal information, abuse and off-topic reports. Only approve still-valid reports; original expiry does not extend with approval or voting.

Before launch: manual browser/device/accessibility and full Spanish review, real notification/audio/PWA tests, production dependency lock and container test, load/abuse tests, TLS/ingress verification, backups/retention policy, moderator coverage, approved GTFS refresh job and monitoring. For background notifications, add push delivery infrastructure; the current fallback is explicit page-open notification only.

Approval is still required before pushing to GitHub or public deployment. Do not use the legacy auto_push.sh script.

Journey UI testing and current production limits: [JOURNEY_PLANNER.md](JOURNEY_PLANNER.md).

If new UI code returns a missing planner API, check `/api/health` for planner_api_version/source_revision/started_at and restart a stale local process. See [stop-search diagnosis](STOP_SEARCH_FIX.md) and `npm run test:live` for unmocked end-to-end checks.
