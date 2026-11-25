# Deployment

For the Docker Desktop workflow on macOS, see [Local staging](LOCAL_STAGING.md).

The repository supports a single application node using Flask, Gunicorn and local
persistent SQLite storage. This document describes the existing deployment
profile; restructuring does not authorize a deployment, provider purchase or
infrastructure change.

## Prepare a reviewed source version

Install pinned runtime dependencies from `requirements.lock` on the approved host.
The root `app.py` still exports the Flask application as `app:app`.

Create and verify a new local source package:

```sh
python scripts/ops/package_release.py --output /protected/NEW-source.tar.gz
python scripts/ops/verify_release.py /protected/NEW-source.tar.gz --sha256 RECEIPT_HASH
```

These commands do not publish or deploy. Keep the checksum receipt separately and
retain the previous approved artifact. Packages include templates, application
assets, backend services and bundled data; they exclude secrets, runtime databases,
virtual environments and the historical source archive.

## Data and configuration

The bundled CSV source is `data/google_transit/`. Prepare or select a matching
schedule index before starting production. Do not rebuild an active index during
a code relocation. For a separate candidate use explicit absolute `GTFS_DIR` and
`SCHEDULE_DB` values; stage and audit with `scripts/gtfs/stage_gtfs.py` and
`scripts/gtfs/audit_gtfs.py`. Review coverage per service date and retain the old
matching CSV/index pair.

The existing default databases remain `instance/schedule.sqlite` and
`instance/community.sqlite`. Existing Compose state volumes and explicit database
environment paths are unchanged. Protect writable state, encryption keys and
backup destinations; do not put secrets in Git or image layers.

`.env.example` documents settings, not a dotenv loader. The full production
requirements, including named moderators, support contact, retention approval,
push encryption, backup encryption, allowed hosts and trusted proxy settings,
are in [the operations runbook](RUNBOOK.md).

An operator environment explicitly using the former bundled path `google_transit`
must use `data/google_transit` for this source version. External cron/systemd jobs
must also reference the relocated scripts. No installed job is changed by this
checkout operation.

## Process and container entry points

```sh
python scripts/ops/start_production.py
```

This validates existing storage/configuration and starts Gunicorn using
`gunicorn.conf.py` and `app:app`. It does not rebuild a schedule on restart.
The existing profile remains one gthread worker, four threads, and the configured
loopback/private-network bind. No concurrency, port or TLS setting changes are
part of restructuring.

`Dockerfile` retains its pinned Python image, non-root user and persistent
`/app/instance` volume. Its command now points to the nested production launcher.
`deploy/compose.yaml` retains app, alert sender, Caddy, private networking, state
volumes, read-only filesystems and secret mounts. Alert commands/healthchecks use
`scripts/ops/`. Review `docker compose -f deploy/compose.yaml config --quiet` on
the approved host with protected settings before any separately approved startup.
Local checks do not certify Docker/Linux execution.

`deploy/ayo-maintenance.service` points to `scripts/ops/maintenance.py`; its user,
working directory, environment and storage restrictions stay unchanged. Installing
or restarting system services requires operator action.

## Release, verification and rollback

`bash deploy/release.sh` and `bash deploy/rollback.sh` remain dry runs without
their explicit apply flags. Apply requires separate deployment approval and the
reviewed artifact, environment, state and schema compatibility. Do not execute
apply merely to check paths.

Before opening traffic, verify HTTPS/ingress, `/api/health`, `/api/ready`, active
GTFS coverage, sender heartbeat, actual named-stop journeys, map/source freshness,
moderation isolation, backups/restore and device acceptance. Readiness alone does
not establish current upstream data. Follow [the runbook](RUNBOOK.md) for encrypted
backup, new-path restore, incidents and rollback. Preserve current rider state.

## Browser compatibility during asset migration

Canonical assets use `/static/js/`, `/static/css/` and `/static/img/`. Fixed legacy
URLs remain aliases to the same files; `/static/privacy.html` remains available
through Flask's template route. The worker stays at `/sw.js` with scope `/`, and
both manifest locations, IDs and start URLs remain stable. The shell cache advances
from v26 to v27 using the existing user-controlled update flow. APIs are not cached
as live data, and favorites/storage keys are unchanged.
