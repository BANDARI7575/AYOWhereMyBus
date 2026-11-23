# Integrated release candidate

> Follow-up test maintenance: [browser test migration](docs/BROWSER_TEST_MIGRATION.md). Six historical scripts are archived; two migrated suites now target the current interface. Earlier failure counts below are historical.

Current implementation results and limitations: [implementation report](docs/IMPLEMENTATION_REPORT.md). Owner-only device setup: [iPhone HTTPS/GPS/Voice guide](docs/IPHONE_TESTING.md).

## Project organization (Phase B)

- `app.py`: compatible Flask/Gunicorn launcher; application code is in `backend/`.
- `backend/release_api.py`: integrated APIs and safeguards; `backend/feature_service.py`: rider workspace/voice tools.
- `backend/transit_engine.py`: GTFS schedules/journeys; `backend/realtime_service.py`: predictions/alerts.
- `static/`: frontend, styling, translations and PWA assets. `navigation.js`, `weather.js`, `rider-tools.js` and `pwa.js` describe their responsibilities.
- `tests/backend/`, `tests/frontend/`, `tests/fixtures/`: Python, Node/browser and shared fixture coverage.
- `scripts/`: operational commands; `scripts/tools/` and `scripts/examples/`: standalone utilities and learning examples.
- `google_transit/` and ignored `instance/`: unchanged timetable and runtime database paths.
- `deploy/`, root `gunicorn.conf.py`/`Dockerfile`/`.env.example`: deployment configuration; no additional config wrapper is needed.
- `archive/legacy/`: preserved obsolete copies and unsafe historical auto-push script; never execute automatically.
- [Documentation index](docs/INDEX.md), [Phase A baseline](docs/PHASE_A_BASELINE.md), [Phase B move inventory](docs/PHASE_B_MOVES.json).

Run from the repository root:

```sh
.venv/bin/python scripts/dev_server.py --port 5050
.venv/bin/python -B -m unittest discover -s tests -t .
npm test
```

`python app.py`, `flask --app app` and Gunicorn `app:app` remain supported. Browser scripts use `AYO_TEST_URL` for an existing QA server; dependencies must already be installed. File relocation does not fix known transit defects or enable paid Voice/GPS HTTPS. Read the phase reports for actual test status.


Current public-launch decision: **BLOCKED pending operational gates**. Read the [final launch-readiness audit](docs/LAUNCH_READINESS.md) and [production/recovery runbook](docs/PRODUCTION_RUNBOOK.md) for tested fixes, PASS/WARNING/BLOCKED status and remaining requirements.

Local development with automatic Python reloads: `.venv/bin/python scripts/dev_server.py --port 5050`, then open http://127.0.0.1:5050/. See the [stop-search fix and real-browser verification](docs/STOP_SEARCH_FIX.md).

The [journey planner rider-experience report](docs/JOURNEY_PLANNER.md) covers named search, location selection, readable journeys, maps, test results and remaining launch blockers.

Work is on `release/integrated-transit`. Start with [deployment instructions](docs/DEPLOYMENT.md), [release results and limitations](docs/RELEASE.md), and [baseline audit](docs/AUDIT.md). The original project story follows for historical context; its roadmap predates this release.

# 🚌 AYOWhereMyBus

### A Milwaukee Bus Tracking Project

Hey, I'm Abhiraj Bandari.

I'm a Computer and Information Science master's student at Concordia University Wisconsin, and I'm currently learning more about Python, Data Engineering, and web development.

I already have experience with web development and app development, which helped me a lot while building this website. Now I'm trying to combine those skills with what I'm learning in Data Engineering and AI/ML.

I started building AYOWhereMyBus because of one simple problem.

Milwaukee winters are crazy. Sometimes you're standing at a bus stop in freezing weather, waiting for a bus, and you have no idea where it is.

I thought, why not build something that helps people see where their bus is?

That's how AYOWhereMyBus started.

I'm building this project from scratch, learning things as I go, making mistakes, fixing them, and trying to improve the website step by step.

## What I've Built So Far

Right now, the website can:

- Show reported Milwaukee buses on a live map.
- Search buses by route number.
- Display a bus's ID, speed, direction, and location.
- Refresh bus locations automatically every 15 seconds.
- Find nearby buses using the user's location.
- Save favorite bus routes.
- Switch between light and dark mode.
- Switch between English and Spanish for parts of the website.
- Work on desktop and mobile screen sizes.

I also added a few flying bats to the homepage.

Why bats? I just thought they looked cool. 🦇

## Technologies I'm Using

- Python
- Flask
- HTML
- CSS
- JavaScript
- Leaflet.js
- OpenStreetMap
- GTFS-Realtime
- Git and GitHub

I'm using Python and Flask for the backend, and HTML, CSS, and JavaScript for the website.

The bus locations come from Milwaukee's MCTS real-time vehicle feed.

## How the Project Works

This is the basic flow:

MCTS Real-Time Data
        ↓
Python
        ↓
Flask API
        ↓
JavaScript
        ↓
Live Bus Map

Python gets the bus information, Flask makes it available to the website, and JavaScript displays the buses on the map.

It sounds simple when I explain it like this, but getting everything to work together took some effort. 😂

## How to Run This Project

First, clone the repository:

    git clone https://github.com/BANDARI7575/AYOWhereMyBus.git

Open the project folder:

    cd AYOWhereMyBus

Create a virtual environment:

    python3 -m venv .venv

Activate it on Mac or Linux:

    source .venv/bin/activate

Install the required libraries:

    python -m pip install -r requirements.txt

Start the website:

    python app.py

Open this address in your browser:

http://127.0.0.1:5000/

You need an internet connection for the live bus information and map.

## What I'm Working on Next

This project is far from finished.

There are a lot of things I still want to build:

- Show nearby bus stops.
- Show when the next bus is expected to arrive.
- Help users plan trips from one location to another.
- Add Milwaukee snow and winter alerts.
- Let people report problems at bus stops.
- Send notifications when a bus is approaching.
- Add an AI voice assistant.
- Analyze bus delays using Data Engineering and Machine Learning.
- Make the website installable on phones.

I'm planning to add these features one by one instead of trying to build everything at once.

## Why I'm Building This

My career goal is to work in AI/ML Data Engineering.

I don't want to learn only by watching tutorials. I want to build real projects where I can understand how APIs, databases, data pipelines, backend systems, and websites work together.

This project gives me a chance to practice those skills while building something that might actually help people in Milwaukee.

## Things I've Learned

A few things this project has already taught me:

- How to work with real-time API data.
- How Python can communicate with a website.
- How to build a Flask backend.
- How to work with JSON.
- How to show GPS locations on a map.
- How to organize HTML, CSS, JavaScript, and Python files.
- How to debug code when something doesn't work.
- How to use Git and GitHub.

And probably the biggest lesson:

Sometimes one extra bracket can break the whole website. 😭

## About Me

**Abhiraj Bandari**

Master's in Computer and Information Science  
Concordia University Wisconsin  
Milwaukee, Wisconsin

Interested in Data Engineering, AI/ML, Python, and building websites.

## Note

This is my personal learning project, not an official MCTS website.

The bus locations are based on the latest reported transit data, so they may not always be exact or up to date.

I'm still learning and improving the project.

If something isn't working perfectly, there's a good chance I'm already trying to fix it. 😂

---

Built by Abhiraj Bandari.

One bus at a time. 🚌
The six “More than a map” cards now open integrated rider workspaces. See
[the feature implementation and QA report](docs/FEATURE_WORKSPACES_RELEASE.md)
for supported flows, actual verification, voice setup boundaries and remaining
public-launch gates. Start locally with `.venv/bin/python scripts/dev_server.py`
and open `http://127.0.0.1:5050/` (reuse an existing running instance).
Live paid conversational AI is disabled by default; the verified text helper
and existing transit features require no OpenAI credential.
