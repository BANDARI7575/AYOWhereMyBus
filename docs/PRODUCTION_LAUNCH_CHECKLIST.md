# Full production launch checklist

Release decision: **NO PUBLIC BETA. All critical gates require evidence and owner sign-off.** This checklist authorizes no push, merge, purchase or deployment.

## Completed in the workspace

- [x] Integrated rider experience, verified schedule engine, conservative realtime matching and safe failure states.
- [x] Named moderation CLI, review queues, audit, abuse holds, voting limits and report expiration.
- [x] English/Spanish app interface, privacy and installation guidance.
- [x] Voice lifecycle, foreground alerts and encrypted background-push infrastructure.
- [x] PWA caching/update/install UI; no cached transit APIs presented as live.
- [x] Walking opt-in, transfer buffer/warnings and itinerary expiry.
- [x] Strict production startup, API validation/rate limits, private database and encrypted backup/restore tooling.
- [x] HTTPS proxy, pinned images, private networking, monitor, worker health, maintenance and rollback tooling.
- [x] Backend, Node, deterministic browser, real-GTFS journey, automated accessibility, local performance and dependency checks documented in LAUNCH_READINESS.md.

## External launch gates — remain blocked until signed

| Gate | Exact action and acceptance evidence | Owner / date / evidence |
| --- | --- | --- |
| Approved infrastructure | Select account, domain and Linux host; run digest-pinned containers; allocate persistent UID-10001 storage, firewall private backend and public HTTPS only; verify real certificate renewal and restart. | Unassigned |
| Real device and assistive technology | On physical iPhone/Safari and Android/Chrome test EN/ES, both autocomplete fields and keyboard, geolocation allowed/denied, 320px navigation, route map, expiry, walking consent, install, standalone reopen, airplane-mode reload, update/recovery; run VoiceOver/TalkBack. Record OS/browser and failures. | Unassigned |
| Native voice and push | Hear EN/ES API readouts, stop/cancel and permission failure. Install where required, consent to a real watch, close page, receive exactly one notice only when an actual fresh matched prediction qualifies; cancel watch; verify stale/unavailable feed sends none. Use a controlled real rider-device subscription, not synthetic arrivals. | Unassigned |
| Spanish acceptance | Native speaker reviews all app-owned pages, dynamic errors, privacy, install, voice and push text; source-language alerts clearly distinguished. | Unassigned |
| Moderation operations | Assign named reviewers and coverage/escalation; provision individual secrets; rehearse pending→approved/rejected, flagged→held, expired visibility, revoked token and support requests. Agree response target and escalation policy. | Unassigned |
| Privacy / provider terms | Approve real support contact, published policy, location/log handling, report and backup retention, MCTS/OSM/weather usage and attribution; obtain legal review as appropriate. | Unassigned |
| Backup / recovery | Schedule encrypted backups, copy off-host, escrow backup key separately, alert on failure, restore into NEW path and rehearse rollback with matching image/index and schema review. Record recovery time and acceptable data-loss window. | Unassigned |
| Monitor and schedule owner | Configure real alert recipients and escalation for readiness, sender heartbeat, upstream freshness, disk, backup age, queue age, TLS expiry and GTFS coverage. Assign official timetable refresh owner and cadence. | Unassigned |
| Host capacity / security | Execute complete suite in Linux/container CI; sustained representative traffic; verify ingress spoof prevention, secret isolation, logging redaction and dependency/image scans; close launch-critical findings. | Unassigned |
| Version approval | Review content-addressed artifact/receipt, matching GTFS and environment; preserve previous approved image/index. Obtain explicit user approval before Git push/merge or public deployment. | Unassigned |

## Release-day acceptance

- [ ] All external gates above signed; no unresolved launch-critical warning or blocker.
- [ ] Verified artifact hash, installed source revision, official schedule current for today and upcoming service changes.
- [ ] HTTPS liveness/readiness, sender and monitoring healthy; backend inaccessible directly.
- [ ] Real named-stop journey, transfers, live tracking, alerts, weather, nearby stops, favorites and creator section checked on approved host.
- [ ] Unapproved report demonstrably invisible; moderation reviewer and backup/recovery on call.
- [ ] Explicit public deployment approval recorded, rollback owner present, then controlled publication with monitoring.
