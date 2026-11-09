# Full production runbook

Prepared locally November 9, 2026. **No public beta; no deployment authorization.** Complete the [launch checklist](PRODUCTION_LAUNCH_CHECKLIST.md) before publication. Do not expose the development server. Work remains on `release/integrated-transit`; no Git push or merge has been performed.

## 1. Release provenance and runtime

Use a reviewed local artifact and retain its manifest/hash and previous approved artifact. Create with `python scripts/package_release.py --output /protected/new-release.tar.gz`; verify with `python scripts/verify_release.py /protected/new-release.tar.gz --sha256 RECEIPT_HASH`. These commands never publish or execute the archive. The artifact excludes secrets, runtime SQLite stores, backup files and virtual environments. Store the receipt separately. Invoke packaged shell scripts with `bash`.

Runtime install: `python -m pip install -r requirements.lock`. QA: `npm ci`, install Playwright Chromium/WebKit, then the tests below. Docker uses a digest-pinned Python 3.12 image, non-root UID 10001; Caddy has a pinned digest in `.env.example`. Local QA ran Python 3.14/Gunicorn and actual loopback Caddy TLS, not Docker/Linux. Validate the chosen host before approval. Maintain a single application node: SQLite, feed caches and planner admission are not a distributed profile.

## 2. Prepare official timetables

`python scripts/stage_gtfs.py --output /protected/NEW-candidate` downloads official MCTS GTFS over verified TLS, bounds extraction, builds and audits a separate candidate. `--zip /trusted/archive.zip` stages an already acquired archive. Never modify an active index or its matching CSVs in place. Review provenance, calendar coverage, `scripts/audit_gtfs.py` results and real journey tests. Existing downloaded official files matched the active sources on November 9; no replacement was necessary. Coverage must be maintained beyond the current March 6, 2027 exception horizon, and checked per service date.

For manual building, export matching `GTFS_DIR` and a NEW `SCHEDULE_DB`, then `python -c 'from transit_engine import Schedule; Schedule().build()'`. The build installs atomically only after success. Activate a reviewed matching CSV/index pair and restart to invalidate caches. Preserve the previous pair. Startup does not rebuild schedules. No public MCTS credentials were necessary for feeds verified in this workspace.

## 3. Secrets and full-release configuration

`.env.example` is a template, not an automatic dotenv loader. Use a host secret manager/protected environment file; never put secrets in Git, URLs, browser storage or command arguments. Private directories 0700, secret files 0600, volume ownership UID 10001.

| Setting | Required action |
| --- | --- |
| AYO_ENV | `production` |
| ALLOWED_HOSTS | Exact real hosts, no scheme; no wildcard |
| MODERATOR_TOKENS | JSON map of named reviewers to distinct cryptographically random secrets of at least 32 characters. Rotate individually. Legacy MODERATOR_TOKEN is supported only when named configuration is absent. |
| PRIVACY_KEY | Separate stable random secret, at least 32 characters; keyed short-lived abuse identifiers |
| SUPPORT_EMAIL | Real staffed operator address; displayed in privacy contact |
| RETENTION_APPROVED | `1` only after policy/owner approval; required for full production |
| GTFS_DIR / SCHEDULE_DB | Matching approved official CSV directory and prepared read-only index |
| COMMUNITY_DB | Private persistent local SQLite path; preserve WAL/SHM permissions |
| VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY / VAPID_SUBJECT | Matching P-256 key file, public key and real `mailto:` operator contact |
| PUSH_ENCRYPTION_KEY | Fernet key protecting subscriptions and selected watch data |
| BACKUP_ENCRYPTION_KEY | Separate Fernet key; escrow independently from encrypted backups |
| BACKUP_RETENTION_DAYS | Reviewed 7–365 days, default 30 |
| PROXY_HOPS | `1` only behind exactly one trusted ingress replacing forwarded headers; otherwise `0` |
| PORT / BIND_HOST | Default 8000 / loopback; Compose binds within private network only |
| TRIP_UPDATES_URL / ALERTS_URL | Official defaults; override only with reviewed credential-free HTTPS source |

Generate push keys with `python scripts/generate_push_keys.py --directory /protected/NEW-keys --contact REAL_EMAIL`; output is private files, not printed secrets. Import into secret manager. Generate the separate backup key using `cryptography.fernet.Fernet.generate_key()` into a protected secret file/manager without logging it. Retain old encryption keys for as long as corresponding backups need recovery. Changing push keys invalidates existing subscriptions; plan opt-in renewal rather than silently promising delivery.

`python scripts/start_production.py` validates hosts, keys, retention approval, support contact, schedule and writable persistent storage before starting one Gunicorn worker/four threads. Full-release startup refuses missing configuration. Run exactly one `python scripts/run_alerts.py` per store under supervision; it locks the store worker, records heartbeat and sends only qualified fresh predictions. App readiness requires its healthy heartbeat. Never run two senders for the same database. Browser/provider notification delivery is not guaranteed and must pass real-device acceptance.

## 4. Host, HTTPS and process preparation

`deploy/compose.yaml` prepares app, sender and Caddy with persistent state/TLS volumes, private backend, read-only root filesystems and dropped app capabilities. Select approved host/domain and set `AYO_RELEASE_ID`, `AYO_ENV_FILE`, `AYO_SECRET_DIR`, `CADDY_IMAGE`, `AYO_DOMAIN`, `TLS_EMAIL` in the Compose invocation environment. Domain/DNS, certificate account and ports require operator provisioning. Application secrets belong in its protected env file and readonly secrets directory.

Before first startup on the approved staging host: `docker compose -f deploy/compose.yaml config --quiet`, build the reviewed image, initialize the persistent volume ownership to UID 10001 using the host's approved storage procedure, and prepare `/app/instance/schedule.sqlite` with matching GTFS. A one-off container `python -c 'from transit_engine import Schedule; Schedule().build()'` can build the initial index before app startup; set its environment/volume explicitly. Never create an empty index by starting the public app first. Keep candidate timetable activation and backups operator-controlled.

`bash deploy/release.sh` is a dry run. Only after explicit approval, set a protected in-container persistent `AYO_BACKUP_DIR` and invoke `bash deploy/release.sh --apply` (or `--apply --first-install` for genuinely empty installation). Existing installs take an encrypted online backup first. The script builds/starts and waits for health; it does not establish all public acceptance gates. On health failure keep ingress closed and investigate; do not bypass readiness.

Keep the backend port unreachable outside the container/loopback network. Caddy replaces forwarded headers and terminates TLS. Verify the actual approved HTTPS host, HSTS, secure cookies, direct-backend rejection and spoofed forwarding resistance. Health/readiness allow local supervisor HTTP; rider APIs require HTTPS in production. Local internal-CA tests did not install a trust root or provision public TLS. Configure ingress request size/time limits and privacy-preserving logs; no raw query strings/GPS, IPs, tokens, cookies or report bodies in retained access logs. Ensure host/container restart and disk-failure alerting; health checks alone do not restart every unhealthy process.

## 5. Moderator operation and abuse

Use `python scripts/moderate.py --url https://APP_HOST queue --state pending`. Token is prompted, or injected via protected `AYO_ADMIN_TOKEN`; never an argument. Additional commands: `queue --state held`, `queue --state flagged`, `queue --after LAST_ID`, `summary`, `audit`, and `review REPORT_ID approved --reason reviewed` / `review REPORT_ID rejected --reason spam`. Reasons also include personal_info, unsafe, incorrect, other and resolved. TLS is required; loopback HTTP requires explicit `--allow-local-http` for isolated QA only.

Named reviewers review text, reject personal information, threats, spam and misleading content, and escalate urgent abuse according to the staffed policy. Three distinct daily peer flags hide a report for review, not proof of abuse. Daily HMAC/cookie limits are deterrents, not verified identities; monitor evasion and shared-IP effects. Pending, held, rejected and expired reports never appear publicly. Approval cannot extend 24-hour expiry. Review actions record actor, reason and time. Review held/flagged queues and oldest-pending age at the assigned cadence. Remove a compromised reviewer's secret and restart, verify access denied, preserve protected audit evidence. Protect tokens from shell history, terminal capture and shared logs.

## 6. Backups, retention and recovery

Online encrypted backup: `python scripts/community_storage.py --backup /protected/NEW.sqlite.enc --encrypt-backup`. Refuses overwrites; uses SQLite backup rather than copying active WAL files. Backup encryption has a reviewed 64 MiB local profile; monitor growth and redesign before exceeding it. Copy encrypted files off-host under a separate account policy; keep keys separately escrowed. Schedule `python scripts/maintenance.py --backup-dir /protected/backups --apply-approved-retention` only after approval. It backs up first, then removes reports seven days past expiry, orphaned votes/flags, old audit/rate/watch state; audit retention is 30 days. Backup pruning only matches the tool's old encrypted filenames, respects configured days and keeps newest two. `--purge-expired` without `--apply` is a dry run. No actual rider records were purged in local QA.

Use the provided systemd maintenance service/timer as a host-specific template; verify its user, environment file and paths. Alert on failure and backup age. Test `python scripts/restore_backup.py --help`, then restore the encrypted backup to a NEW private destination using the escrowed key. Authentication and SQLite integrity must pass; never overwrite active state. Test recovery after a process restart, not just file creation. Document recovery time, acceptable loss window, off-host retention and deletion requests. Legal/provider and hosting policy approval remains human work.

## 7. Monitoring and capacity

- `/api/health`: liveness/version/source revision. `/api/ready`: local storage, prepared schedule, active service today and sender heartbeat; 503 is a deployment gate. Realtime freshness is monitored separately.
- Run `python scripts/monitor.py --help` for the read-only monitor. Wire real external recipients for availability, upstream ages, worker failures, expired GTFS, disk/WAL growth, backup age, TLS renewal and moderation queue age. A CLI output is not an external on-call service.
- API per-peer budgets: 120 reads/minute, 12 writes/minute, 8 planner/minute; 3 reports/hour, 30 votes/hour, 4 abuse flags/hour, 6 push subscriptions/hour. Account for shared IPs. Two expensive planner searches admitted; excess receives 503/Retry-After. Successful short-lived cache is bounded and never extends itinerary validity.
- Feeds have verified TLS, no redirects, size cap and total request deadline; unavailable sources stay unavailable/scheduled-only. Sender has bounded rounds, retry/deduplication and privacy-safe count/error-type logging. Never treat missing service alerts as proof of normal service.
- Small local concurrency results are recorded in qa/full-release-performance.json; establish sustained target load on selected host. Do not replicate SQLite across independently writable nodes.

## 8. Tests and acceptance

Run `python -m unittest discover -s tests -q` and `npm test`. With a loopback app and Playwright browsers installed, run `npm run test:browser`, `npm run test:features`, `npm run test:release`, `npm run test:live`, `npm run test:a11y`. See test files for AYO_BASE_URL/AYO_CHROME_PATH and report-path options. Set up isolated community storage/secrets for production-profile tests; never seed synthetic reports into rider storage. Audit Python lock/npm dependencies and final image, syntax-check scripts, verify artifact and collect CI receipts. Existing local evidence is documented in LAUNCH_READINESS.md; remote CI/container and actual device acceptance remain outstanding.

Physical-device acceptance must include real speech output, location denial, native EN/ES push with page closed and qualifying real prediction, installation, offline/reopen/update, VoiceOver/TalkBack and Spanish review. Automated mocks are not substitutes. Complete the full checklist, request explicit deployment approval, then execute on approved infrastructure.

## 9. Rollback and incident recovery

1. Close ingress/maintenance mode and drain traffic. Record artifact/index IDs and incident reason without rider content.
2. Take a NEW encrypted online backup. Preserve failing artifact and existing state; do not reset databases.
3. Select previous approved image and matching timetable. Confirm schema compatibility. `bash deploy/rollback.sh` is a dry run; approved compatible rollback requires `--apply --schema-compatible`, previous `AYO_RELEASE_ID`, matching protected environment and `AYO_BACKUP_DIR`. It does not build or pull an unreviewed replacement.
4. If schema is incompatible, restore the matching encrypted backup into a NEW path, explicitly assess lost reports/watches since that snapshot and update mounts under approved change control. Never blindly overwrite the latest database. Push-provider effects cannot be undone by restoring SQLite.
5. Require healthy app/sender, active calendar, real named-stop journey, private unapproved report and monitoring before reopening traffic. Keep previous versions until incident review and approved retention.

Encrypted backup/new-path restore, graceful Gunicorn restart and local TLS were exercised in isolated storage. Actual host/container rollback, off-host recovery and public certificate renewal remain required rehearsals, not completed claims.
