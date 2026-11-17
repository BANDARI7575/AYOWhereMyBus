# 🚌 AYO! Where's My Bus?

### Less Waiting. More Living.

**A Milwaukee Transit Intelligence Project**

AYO! Where's My Bus? is a transit website designed to help Milwaukee riders spend less time waiting outside and more time getting where they need to go.

## Why We Built AYO!

Milwaukee winters can be brutal. Freezing temperatures, snowstorms, icy sidewalks, and unexpected bus delays can make everyday travel difficult.

AYO! was created to make bus information easier to access, especially when riders need to decide when to leave home.

## Project Features

- **Nearby Stops:** Find MCTS stops near your location.
- **Bus Tracking:** View reported bus GPS locations.
- **Trip Planner:** Search for journeys between locations.
- **Service Alerts:** Review official MCTS service notices.
- **AYO AI:** Transit-focused text assistant.
- **Saved:** Keep favorite stops, routes, and journeys.
- **English and Spanish:** Multilingual interface controls.
- **Responsive Design:** Designed for desktop and mobile devices.

Some features remain under development or require further testing before public launch.

## About the Founder

**Abhiraj Bandari**

Data Engineer · Co-founder, A Work Connect Private Limited · Creator of AYO!

Milwaukee, Wisconsin · Concordia University Wisconsin · Computer and Information Sciences (December 2026)

AYO! combines an interest in data engineering, web development, and building practical tools for everyday problems.

**Built in Milwaukee. Inspired by everyday riders. Made for the journey.**

---



# AYO! Where’s My Bus?

AYO helps Milwaukee riders find official stops, track reported MCTS bus positions,
plan scheduled journeys and review service alerts. It includes saved stops and
routes, English and Spanish controls, weather, a transit question helper and an
installable offline shell.

Vehicle GPS positions are not arrival predictions. The interface labels scheduled
times, qualified realtime predictions, estimated walking and unavailable data
separately. Offline pages cannot establish current transit conditions.

## Requirements

- Python 3.12 or newer with a virtual environment.
- The official bundled GTFS files and a prepared SQLite schedule index.
- Node.js and npm for automated frontend tests; no frontend build is needed to run
  Flask. Browser tests use the pinned Playwright development dependencies.

## Setup

For a new development checkout:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
npm ci
```

The lockfile is the reproducible runtime dependency set. `requirements.txt` records
the main dependency ranges. Do not replace the lockfile with an unpinned install
for production.

Only when preparing a new schedule index, or an approved separate candidate:

```sh
.venv/bin/python -c 'from backend.services.transit_engine import Schedule; Schedule().build()'
```

An existing matching `instance/schedule.sqlite` does not need rebuilding after
repository restructuring. Preserve it and `instance/community.sqlite`.

## Local development

```sh
.venv/bin/python scripts/dev/dev_server.py --port 5001
```

Open http://127.0.0.1:5001. This server binds to loopback by default and disables
the interactive debugger and automatic reloader. Restart it after Python changes.
`/api/health` reports its startup time and source revision. The compatibility
command `python app.py` still serves loopback port 5000; use one intended server,
not multiple stale processes on different ports.

Environment variables are supplied by the shell or host configuration; the app
does not automatically load `.env.example`. That file includes production-only
settings and placeholder secrets, so do not blindly source it for development.

| Setting | Default or purpose |
| --- | --- |
| `GTFS_DIR` | Repository-root `data/google_transit/`; override for an approved source directory. |
| `SCHEDULE_DB` | Repository-root `instance/schedule.sqlite`; prepared matching index. |
| `COMMUNITY_DB` | Repository-root `instance/community.sqlite`; private persistent state. |
| `TRIP_UPDATES_URL`, `ALERTS_URL` | Official GTFS-Realtime sources; override only with reviewed sources. |
| `AYO_ENV` | Production enables strict startup/security requirements. |
| `ALLOWED_HOSTS`, `PROXY_HOPS`, `PORT`, `BIND_HOST` | Host and trusted-ingress configuration. |
| Moderator, privacy, push and backup settings | See the complete operator configuration in [the runbook](docs/RUNBOOK.md). |

Default paths do not depend on the working directory. Use absolute paths for
operator-managed overrides. Existing environments explicitly naming the previous
bundled `google_transit` directory need `data/google_transit` before running this
checkout. Runtime database paths and schemas have not changed.

For iPhone GPS and microphone testing, follow [the HTTPS/device guide](docs/IPHONE_TESTING.md).
A phone accessing a Mac's LAN address needs trusted HTTPS. Certificate trust,
physical-device permissions and native audio acceptance are manual owner steps.
The text transit helper works independently of paid AI. Optional browser speech
requires browser support and permission; paid AI remains disabled until all
account, authentication, spending and acceptance requirements are approved.

## Tests

```sh
.venv/bin/python -B -m unittest discover -s tests -t . -v
npm test
```

With an existing local test server and installed browser engines:

```sh
AYO_TEST_URL=http://127.0.0.1:5001 npm run test:release
AYO_TEST_URL=http://127.0.0.1:5001 npm run test:failure-recovery
AYO_TEST_URL=http://127.0.0.1:5001 npm run test:pwa-upgrade
```

Set `AYO_CHROME_PATH` to an installed Chrome executable when required, and
`PLAYWRIGHT_BROWSERS_PATH` if using an existing nondefault browser cache.
The SVG, weather, units, scroll, map-layout and fixture planner commands are in
`package.json`. `test:live`, `test:routing` and `test:workspaces-live` need real
schedule coverage and honor API rate limits; run them against isolated community
storage. Browser mocks do not establish physical iPhone, native audio or public
hosting acceptance.

## Repository layout

```text
app.py                         Compatible Flask/Gunicorn launcher
backend/app.py                 Flask application and vehicle endpoints
backend/release_api.py         API registration and application safeguards
backend/paths.py               Repository-root defaults
backend/services/              Schedule, realtime, stops, alerts and rider services
data/google_transit/           Official bundled timetable files
data/buses.json                Historical export, not live tracking input
templates/                     Homepage and privacy HTML
static/js/                     Application JavaScript
static/css/                    Application styles
static/img/                    Icons and retained artwork
static/vendor/                 Leaflet, fonts and licenses
static/sw.js                   Service worker, served publicly at /sw.js
scripts/ops/                   Operations, storage, monitoring and packaging
scripts/gtfs/                  GTFS staging and audit
scripts/dev/                   Local server and private TLS preparation
scripts/tools/, scripts/examples/      Optional console utilities and learning examples
tests/backend/, frontend/      Python, Node and browser tests
tests/fixtures/                Isolated test inputs, including old PWA shell
instance/                      Ignored databases and private local TLS state
deploy/                        Existing deployment templates and guarded scripts
docs/archive/, archive/legacy/ Preserved historical documentation and source
```

## Deployment and maintenance

The production entry point remains `app:app`, with the existing single-node
Gunicorn and persistent SQLite profile. Docker, Compose and systemd templates
retain their security, networking and storage settings; only relocated command
paths change. No deployment is performed by this refactor.

Read [deployment](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md) and
[operations](docs/RUNBOOK.md) before using an approved host. Production needs
trusted HTTPS, real operator configuration, backups, monitoring, moderation and
physical-device acceptance. The development server is not the public deployment.

The [restructuring report](docs/RESTRUCTURING_REPORT.md) records verification and
moves. [Deletion candidates](docs/DELETION_CANDIDATES.md) are review-only: no files
were removed. Do not execute the retained historical automatic-push script.
