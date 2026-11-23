# Integrated end-to-end audit checkpoint

Baseline: 548fdde on release/integrated-transit. No commit, push, merge or deployment authorized. Existing untracked backup source files are preserved.

Status vocabulary: PASS / FAIL / NOT TESTED. Prior receipts are historical evidence only; final results below will identify checks rerun during this audit.

| System | Initial finding | Verification planned |
| --- | --- | --- |
| Journey quality | FAIL: official stop 2783 → 66 reproduces Route 14 westbound to 17th then eastbound, 31 minutes at Nov 9 11:00. Nearby westbound stop 9651 is reached directly in 1 minute. | Actual GTFS pair; direction, proximity, scoring, transfer and walking regressions; real-browser pair |
| UI / map / navigation | NOT TESTED this audit | WebKit/Chromium desktop/mobile/tablet; map clipping; bilingual layout; keyboard; automated contrast/accessibility |
| Live tracking / predictions / alerts | NOT TESTED this audit | Matching/freshness/failure fixtures; official read-only feed observations |
| Nearby / geolocation / favorites | NOT TESTED this audit | Permission success/denial/manual paths, names, departures, storage recovery |
| Winter Watch / moderation | NOT TESTED this audit | Isolated validation, auth, visibility, abuse, votes, expiration, retention/persistence |
| Voice / localization / alerts | NOT TESTED native devices | Automated adapter contracts plus EN/ES browser checks; native audio/push remain external |
| PWA / poor network | NOT TESTED this audit | Real service-worker caching, offline reload, no cached transit promises |
| Security / persistence / operations | NOT TESTED this audit | Regression suite, lockfile audit, backup/restore tooling and configuration review |
| Public hosting / staffing / physical accessibility | NOT TESTED / externally blocked | Approved infrastructure, moderation/support staffing, real phone and screen-reader acceptance required |

Final findings, changes and evidence will be appended after repairs and tests. No fabricated arrivals or pedestrian accessibility claims are permitted.

## Consolidated final report

**Local audit complete; public release remains BLOCKED.** Baseline 548fdde was inspected before editing. No commit, push, merge, purchase or public deployment occurred. Untracked pre-existing backup source files were left alone. No actual rider reports were seeded, moderated or purged. QA browser data and operations storage were isolated.

### Issues and exact repairs

| Severity | Root cause | Coordinated repair and regression |
| --- | --- | --- |
| HIGH — confirmed directional detour | Earliest-arrival search treated exact platforms as unrelated endpoints regardless of their proximity; accepted a same-route out-and-back and collapsed all incoming trips into one stop label. The selected Jackson 66 platform differs from nearby westbound Jackson BRT 9651. | Keep IDs exact; display official route/headsign directions and stop IDs in suggestions. Keep up to four incoming-trip labels per stop so trip-specific transfer rules can be evaluated. Score actual arrival with explicit transfer, walking and backtracking preferences. Exclude gross short-trip detours and longer same-route retracing reversals. Return honest no-reasonable-route state and explicit nearby platform choices, never silently switch stops. Tests reproduce the actual pair at 07:00, 11:00 and 17:00 and a longer Bayshore reversal; fixture tests prove direct preference and retained viable transfer labels. |
| HIGH — arrival-notice freshness | Foreground sender checked prediction time but did not independently require fresh prediction timestamp/feed status; negative uncertainty could qualify in both senders. | Require fresh feed, reported timestamp within -60..180 seconds, future matched realtime prediction within five minutes, no cancellation and nonnegative supplied uncertainty ≤120 seconds. Added three browser suppression cases and backend sender regressions. |
| MEDIUM — route visualization | Full scheduled-trip shape made a short ride appear to traverse a much longer route. | Clip using the boarding/alighting GTFS shape_dist_traveled and official shape points when compatible distances exist. Preserve explicitly disclosed full-trip fallback when they do not; never draw a fictional pedestrian route. Fixture geometry regression passes. |
| MEDIUM — walking coverage and labels | Walking was generated only after a ride, omitting access and independent short trips. A walking-only result inherited scheduled labels and immediate departure-based expiry. | Opt-in access/transfer/egress estimates up to 400 m, explicit straight-line basis and unverified crossings/accessibility. Walking-only response is estimated_walk, estimated start/arrival, five-minute revalidation, with no drawn path. Regressions verify opt-in/off and no invented geometry. |
| MEDIUM — poor GPS precision / empty stale feeds | Nearby-stop ordering ignored browser accuracy; an empty stale vehicle response could receive a feed-reached label. | Show low-accuracy warning above 200 m and manual-stop fallback; stale feed warning applies even when zero buses are returned. Browser tests cover poor accuracy, permission denial, stale-empty feed and recovery. |
| MEDIUM — expanded-search cost | Preserving incoming-trip alternatives increased repeated departure/stop-time work and walking expansion could hit the deadline. | Request-local departure/trip/neighbor/distance caches; constant-time accumulated preference scores; top-label pruning; final-round walking only to the actual destination; eight-second admission/search guard retained. Ten representative cold searches now complete in the recorded 0.068–2.566 seconds. No public-host capacity claim. |
| MEDIUM — CI configuration | Browser suites defaulted to different ports; official index preparation was not explicit, potentially skipping the new official-data regression. | Set one job-wide AYO_TEST_URL and prepare the bundled official index before backend tests. Pipeline reviewed locally; remote Linux execution remains NOT TESTED because nothing was pushed. |
| LOW — offline asset refresh | Changed rider code needed a fresh shell cache. | Increment shell namespace to v7; real worker cache/offline reload passed. Existing update controls remain. |

### Actual Cass → Jackson behavior

At the fixed official-schedule regression time **November 9, 2026, 11:00 Milwaukee**:

- Cass `2783` → exact Jackson `66`, walking OFF: **no reasonable route within the bounded policy**, not the 31–32 minute Route 14/17th Street reversal. No-route does not mean there is no MCTS service.
- Rider explicitly selects nearby Jackson BRT `9651`: **one verified scheduled Route 14 ride, 60 seconds riding time** at that test time. Initial waiting is separately displayed and changes with search time.
- Rider keeps Jackson `66` and enables estimates: **261-second estimated straight-line walk**, not a pedestrian navigation route, accessibility verification or scheduled bus service.

Both browser engines passed the named-stop/keyboard/platform-change/walking flow at desktop and mobile widths. Actual current results depend on schedule coverage and search time; no example itinerary is served as live data.

### Audit checklist results

| System | Result | Evidence / practical limit |
| --- | --- | --- |
| Cinematic UI, creator, themes, navigation | PASS locally | 16 integrated browser scenarios: Chromium/WebKit × EN/ES ×1440/768/390/320px; tablet/mobile touch contexts. Creator text, weather fixture, nearby tools, routes/favorites and mobile keyboard/Escape pass. Desktop/mobile screenshots inspected. Homepage HTML, CSS and Milwaukee artwork were not edited in this audit. Not a pixel-diff or physical-device certification. |
| Map | PASS locally | Eight engine/viewport scenarios, real Leaflet CSS/JS, deterministic tile images: integrity acceptance, pan/zoom/resize, clipping and no page overflow. Prior CSS-integrity fix retained. Third-party cartographic availability is not certified by test tiles. |
| Tracking, routes, GPS | PASS locally; WARNING field accuracy | Feed parsing, route validation, timestamps, stale/failed responses and recovery covered by backend/browser tests. Snapshot: 189 vehicles, all 189 GPS reports within freshness threshold, 16-second feed age. Snapshot is not a future guarantee. |
| Predictions and service alerts | PASS locally; WARNING source coverage | 343 fresh trip-update entities, eight active official alerts in read-only observation. Tests reject mismatched route/sequence/date, stale feed, unsupported/differential data and absurd times. GPS never manufactures arrivals; no occupancy supplied. Journeys remain scheduled and do not guarantee realtime transfer feasibility or automatically reroute around every alert. |
| Nearby, departures and favorites | PASS locally | Geolocation success/denial/poor precision, manual suggestions, official IDs/headsigns, departure labels, favorite persistence/corrupt storage tested. Access paths and device GPS accuracy are not certified. |
| Journey logic | PASS within documented bounds | 87 backend executions include calendar exceptions, after-midnight, transfer rules/margins, prohibited pickups, invalid/no routes, directions/detours, candidate scoring, walking and clipped geometry. Six general real-GTFS journeys and four targeted real-stop browser flows passed; not a globally optimal/unbounded routing engine. |
| Winter Watch / database | PASS locally; BLOCKED staffing | Isolated suite checks pending/held/rejected privacy, named authentication, moderation audit, flags/abuse threshold, votes, rate budgets, duplicates, expiry, encrypted backup/new-path restore and approved retention. Text only; approval is human, not verification of conditions. Human coverage and escalation remain unassigned. |
| Accessibility / Spanish / voice | PASS automation; NOT TESTED human acceptance | 12 homepage EN/ES dark/light scans plus four real rendered-itinerary scans: zero detected axe WCAG A/AA/2.1-AA violations. Keyboard/autocomplete and speech adapters pass. Voice provides text-to-speech readout only; speech-to-text/conversational planning is not implemented. Actual VoiceOver/TalkBack, native audio and native-speaker review remain external gates. |
| PWA / poor connectivity | PASS locally; NOT TESTED native install | Real v7 service worker caches shell, excludes transit APIs; offline reload/banner and uncached API behavior pass. Cached content is not represented as live transit. Physical installation, update and OS lifecycle remain required. |
| Arrival alerts | PASS logic; NOT TESTED real delivery | Scheduled-only/stale/uncertain suppression, one-shot deduplication, encrypted subscription ownership, provider validation, worker and push payload expiry tested. Browser notification/speech adapters are mocked; actual device/provider delivery is not claimed. |
| Security / operations | PASS local scope; WARNING host acceptance | Real loopback Caddy TLS + production Gunicorn: readiness/health/search 200, anonymous moderator 401, authenticated queue 200, foreign-origin write 403, insecure API and untrusted application Host 400. Database/log/privacy/backup tools reviewed and regression-tested. Limited tracked-source credential pattern scan: zero matches, not a comprehensive secret or penetration audit. |
| Dependencies | PASS snapshot | 30 pinned Python runtime packages: zero known findings from pip-audit; npm advisory audit: zero findings across five reported entries. Pins lack full package hashes; Docker image/platform and host security need separate validation. |
| Performance | PASS bounded local check; WARNING capacity | Ten actual indexed-schedule searches, including airport/Bayshore/Capitol, 0.068–2.566s; walking-disabled exact-platform no-route is explicit. 24 real HTTPS mixed reads at concurrency four: all 200, mean0.0513s, p95 0.1504s. Single-node SQLite, bounded candidate/departure policy and finite deadline remain; peak sustained host load NOT TESTED. |
| Public release | BLOCKED | Real hosting/domain/public certificates, persistent production volumes, off-host backup/key escrow/recovery, monitoring recipients, staffed moderation/support, legal/provider/privacy decisions and physical-device/native push/Spanish/screen-reader acceptance remain required. |

### Tests actually run

Final successful local runs: **87 backend unittest executions**, **11 Node tests**, **62 grouped planner browser assertions/scenarios**, **12 feature contracts**, **16 bilingual integrated browser scenarios**, **8 map engine/viewport scenarios**, **6 general unmocked scheduled journeys**, **4 targeted Cass/Jackson browser flows**, and **16 automated accessibility scans** (12 homepage plus four rendered real journeys). Backend counts include inherited tests; these are not 87 distinct feature scenarios. Complete GTFS integrity scan found zero orphan references, invalid coordinates/times, backward times or calendar conflicts across 1,005,312 stop-time records. Python compilation, JS syntax, shell syntax and git diff whitespace checks passed.

Intermediate checks identified test-harness issues rather than hidden passes: the expanded notification fixture used Node wall time while browser time advanced, so it expired correctly; fixture timestamps now follow the simulated browser clock with awaited responses. Axe required an explicit browser context, which was added before the final successful scans. An immediate request during graceful QA worker HUP received a transient 502; stable post-restart readiness was verified. The unmatched local proxy virtual host returned an empty response, so Host rejection was tested at the private application boundary, where it correctly returned 400.

Receipts under `docs/qa/integrated-*` capture GTFS integrity, actual journeys, targeted browser/axe results, source-feed snapshot, dependency snapshot, loopback HTTPS and performance. Browser fixtures deliberately isolate transit/weather/community data and native speech/notification adapters; no synthetic response was added to application runtime.

### Files changed in this audit

- Routing/backend: `transit_engine.py`, `push_service.py`.
- Rider UI: `static/journey.js`, `static/app.js`, `static/stops-ui.js`, `static/release.js`, `static/es.json`, `static/sw.js`.
- Regression and CI: `tests/test_routing_quality.py`, `tests/routing-quality.browser.cjs`, `tests/journey.browser.cjs`, `tests/features.browser.cjs`, `tests/full-release.browser.cjs`, `tests/map-layout.browser.cjs`, `package.json`, `.github/workflows/tests.yml`.
- Documentation/evidence: this report, `docs/LAUNCH_READINESS.md`, `docs/PRODUCTION_RUNBOOK.md`, `docs/PRODUCTION_LAUNCH_CHECKLIST.md`, and `docs/qa/integrated-*` receipts.

## Production launch gates

See [full checklist](PRODUCTION_LAUNCH_CHECKLIST.md) and [runbook](PRODUCTION_RUNBOOK.md). No public beta exception.

- [ ] Approved Linux/container host, real domain/DNS/public TLS renewal, private backend and durable UID-10001 storage.
- [ ] Full remote/container CI, sustained target load, independent host/security review and approved artifact.
- [ ] Staffed named moderation/support, abuse escalation and retention ownership; real contact and provider/privacy/legal approval.
- [ ] Off-host encrypted backups, separate key escrow, monitoring recipients, GTFS refresh owner and rehearsed host restore/rollback.
- [ ] Physical iPhone/Android install/offline/update/geolocation, real EN/ES speech and closed-page push using a qualifying real prediction.
- [ ] Human Spanish and VoiceOver/TalkBack acceptance and field route usability review.
- [ ] Explicit permission before committing, pushing, merging or public deployment.

## How to test locally

From the project directory use `.venv/bin/python scripts/dev_server.py` and open **http://127.0.0.1:5050/**. If that existing server is already running, use it; do not start a second copy on the occupied port. Reload online and accept an available AYO update prompt to activate v7. Verify `/api/health` reports source revision **17d2910d71f4** for this runtime source (documentation/test changes do not affect the runtime hash).

1. In From search `Wisconsin Cass`, choose **WISCONSIN & CASS** (`2783`); in To search `Wisconsin Jackson`, choose **WISCONSIN & JACKSON** (`66`). Leave walking off. Confirm the long westbound/17th/eastbound loop is not offered and nearby directional stops are explicit choices.
2. Choose the nearby destination **WISCONSIN & JACKSON BRT STATION** (`9651`), then search again. A current covered direct service should use a verified scheduled trip; wait/departure times depend on the clock.
3. Restore `66` and enable estimated walking. Confirm estimated-only labels, unverified-path warning and no drawn walking route. Toggle walking off and repeat; the planner must not silently move stops.
4. Test keyboard arrows/Enter/Escape, location denial/manual fallback, dark/light and EN/ES, mobile menu, route/map refresh and airplane/offline display. Read departure labels and service alerts before travel.

Automated commands: `.venv/bin/python -m unittest discover -s tests -q`, `npm test`, and with installed Playwright browsers and the running local server: `AYO_TEST_URL=http://127.0.0.1:5050 npm run test:browser`, `test:features`, `test:release`, `test:map`, `test:live`, `test:routing`, `test:a11y` (invoke each via `npm run`). Set `AYO_CHROME_PATH` when using installed Chrome instead of Playwright Chromium. QA in this workspace used `/private/tmp/ayo-planner-qa/node_modules` via NODE_PATH and WebKit in `/private/tmp/ayo-planner-browsers` via PLAYWRIGHT_BROWSERS_PATH. Real-schedule browser checks need current coverage; the targeted check deliberately honors planner rate budgets and may wait for the next minute. Do not run notification/moderation QA against public rider storage.
