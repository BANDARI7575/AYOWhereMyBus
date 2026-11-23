# Release-readiness review — November 22, 2026

Assessment of the existing `chore/restructure` branch at committed baseline
`ee7efbc036c04b479d1bb1601ecf3e5ce642ec42`, with the local changes described below.
The review uses installed Chrome and Playwright WebKit on macOS, Python 3.14.8
and Node 24.11.0. It does not authorize publishing or deployment.

## Defects and targeted corrections

1. **Routing test state:** the direct-bus test inherited enabled walking, then
   asserted that its first leg must be a bus. The real planner correctly returned
   a faster estimated walk. The test now explicitly disables walking for the
   bus-service assertion, then explicitly enables it for separate walking
   coverage. Original status, exact-stop, bus-leg, geometry, ordering and
   accessibility assertions remain. A new isolated backend regression proves a
   faster short walk wins over an available direct bus and is labeled estimated,
   with no pedestrian geometry. The routing algorithm was not changed.
2. **Trip contrast in light mode:** Trip retained its approved charcoal surface
   but inherited light-theme foreground variables. This made fields, notes,
   inactive controls and the submit label fail contrast checks. Trip now scopes
   the existing dark palette to its own surface, including text and native input
   color scheme. No layout, functionality or other screen was redesigned.
3. **Failure-recovery test cache:** a test opened retired cache `ayo-shell-v28`,
   creating an empty cache and failing the asset assertion. It now reads the
   expected cache name from the shipped worker. Asset presence, API exclusion,
   offline reload, stale prediction/feed suppression and deduplication assertions
   remain unchanged.
4. **Documentation:** removed a duplicate README introduction, repaired two
   missing restructuring-report links, and corrected current navigation,
   walking-setting and worker-version descriptions. Historical reports remain
   retained and are not current acceptance certificates.

## Test scope

The executed commands cover Node units, full Python discovery, core browser
configurations, release/features, routing, accessibility, Trip controls, Trip,
journey fixtures, weather, SVG, scroll restoration, display units, map layout,
failure recovery, PWA upgrade, Home/chat, Alerts, Saved, Founder, unmocked live
journeys, live workspace handoffs and the standalone accessibility audit.

Aliases such as `test:map`, `test:controls`, `test:utility`, `test:workspaces`,
`test:home`, `test:completion` and `test:utility-pwa` invoke scripts already covered
by these commands; they are not counted as additional independent test suites.
Tests use isolated browser contexts. The local QA server uses a separate community
SQLite file and port 5056; the existing server on 5055 was not replaced.
Final QA health reports `ok`, source revision `5d00bc57ea2c` matches the final
application bytes, and delivered Trip CSS matches disk. Installed
browser dependencies were used; no packages were installed or upgraded.

The following completed results are verified:

| Check | Result |
| --- | --- |
| `npm test` | 38 passed |
| Full Python discovery | 133 passed, including the new ranking regression |
| Frontend/test JavaScript syntax | 56 files parsed successfully |
| `test:browser` | 12 configurations passed |
| `test:release`, including final rerun after the contrast fix | 36 configuration/result lines passed |
| `test:a11y`, final rerun | 12 configurations passed across screens, themes, languages and both engines |
| `test:features` | Both engines passed |
| `test:trip-controls` | Four configurations passed |
| `test:trip` | 16 configurations passed |
| `test:routing`, corrected test | Four real-GTFS configurations passed; rendered-journey accessibility checks passed |
| `test:journey-fixtures` | Three responsive viewports; suite reports 62 assertions/scenarios, including Spanish/map fallback |
| `test:weather` | 12 checks passed |
| `test:svg`, `test:scroll`, `test:units-browser`, `test:map-layout` | Passed |
| `test:failure-recovery`, final rerun | Both scripts passed in Chrome and WebKit |
| `test:pwa-upgrade` | Both engines passed; favorites retained |
| `test:chat`, `test:alerts-visual`, `test:saved`, `test:founder` | 16 configurations passed per suite |
| `test:live` | Six unmocked GTFS browser journeys passed |
| `test:workspaces-live`, isolated rerun after the minute reset | Chrome desktop and WebKit mobile passed real stop/favorite/planner/tracking handoffs |
| Standalone accessibility audit | 12 language/viewport/theme scans, no reported violations |
| Imported GTFS integrity audit | Passed all configured integrity checks |
| `pip check` | No broken requirements; installed runtime packages match all 30 lockfile pins |
| npm advisory audit | Zero reported vulnerabilities |
| OSV query of 30 pinned Python packages | Zero advisory matches |

Initial failures are retained in the local logs rather than erased: the original
routing assumption, light-mode Trip contrast and old-cache test each failed
before correction. Their final reruns passed. The first live workspace run also
encountered HTTP 429 after back-to-back live suites shared the same eight-search
minute budget. This is expected enforcement; no production rate limit was relaxed.
The standalone rerun waited for the next minute, required HTTP 200, and passed
both engines. No configured suite remains failed or blocked after these reruns.

Automated checks are not a complete human accessibility audit. Most interaction
suites use explicit fixture/provider responses. Those results do not certify
current external data, GPS permissions or provider delivery. Separate unmocked
checks below establish the observed live/API behavior.

## Transit behavior verified

- Leave Now selects the current-time mode, clears/disables the future input,
  gives confirmation and does not submit a search. Find My Journey sends no
  future override; backend tests verify America/Chicago request-time handling
  and separate cache entries from future searches. Existing short-lived journey
  caching remains unchanged.
- Depart At converts the selected Milwaukee wall time to an explicit instant;
  invalid, past, ambiguous/nonexistent DST and unsupported windows are rejected.
  Swap exchanges selected IDs and their displayed locations, preserving time.
- **Arrive By remains unsupported.** Its visible explanation and official-planner
  fallback are tested; it does not silently substitute a departure-time search.
- Search is bounded to two bus rides, four incoming labels per stop and an
  eight-hour horizon with an eight-second computation budget. Ranking includes
  transfer, walking and backtracking penalties. It is not a globally optimal
  router, but a fast legitimate walk is not forcibly replaced by a bus.
- Walking connections are enabled by the current checkbox default. They are
  straight-line estimates, not verified crossings, safe/accessible paths or
  turn-by-turn navigation. Walking legs contain `estimated: true` and empty
  geometry; UI copy discloses these limits. External map links remain available.
- Official-data direct-bus checks observed Route 14 between Stops 2783 and 9651
  with walking disabled. Separate walking-enabled cases retained their estimate
  labels and no invented geometry.
- A read-only current-time GTFS probe found a two-bus journey from Stop 2783
  (WISCONSIN & CASS) to Stop 4231 (HIGHLAND & N35), using Routes 14 and 30 via
  Stop 9651. Its 1,140-second transfer margin exceeded the 180-second minimum.
  This is a dated schedule observation, not a promise of future service or a
  live arrival prediction. Fixture tests additionally cover forbidden/minimum
  transfers, incoming-trip restrictions, extended service days and DST.
- Six actual GTFS browser journeys selected real downstream stops and rendered
  scheduled routes without intercepting journey/search APIs. Selection is based
  on the imported schedule at execution time, rather than a fabricated result.
- A live API snapshot observed 107 valid reported vehicle coordinates with a
  fresh vehicle feed and seven fresh official alerts. Counts vary over time.
  Invalid journey stop IDs produced HTTP 400 with a helpful message.
- GTFS audit counted 3,694 stops, 49 routes, 18,479 trips, 1,005,312 stop-time rows
  and 251,700 shape points. No configured orphan-reference, coordinate, calendar
  conflict, invalid-time or backward-time checks failed. This imported snapshot
  contains zero explicit transfer/frequency rows; engine fallback transfer rules
  and separate fixture-rule tests must not be mistaken for source rules present
  in this particular feed.

## Security and configuration review

**GitHub currently reports the repository as public.** This differs from the
previous private verification. The owner explicitly requested leaving settings
unchanged during this review. Visibility was read only; no setting was changed.
The remote branch matched the committed local baseline at the check. Current
review changes remain local and uncommitted.

A local pattern scan examined working-tree text and reachable-history text blobs
under 3 MB: 733 candidates, no matched private-key/provider-token/GitHub-token/AWS
key patterns, and no sensitive credential-file paths found in history. This is a
bounded pattern scan, not proof that every secret or personal detail is absent.
No credential values were printed or included in the report. The approved Founder
contact and test fixtures remain intentional project content. `.gitignore`
excludes environments, private keys, credentials, databases, caches and local
state. Ignoring a file does not remove any earlier copy from Git history.

Dependency checks queried the current npm and OSV services; no autofix, version
change or install was performed. Zero reported advisories does not establish the
absence of vulnerabilities. OS/base-image and browser/runtime vulnerability scans
were not performed; Docker is not installed in this test environment.

Configuration review found production fail-closed checks for real secrets,
trusted hosts, operator contact, retention approval, push/backup encryption and
persistent schedule storage; bounded requests/body sizes; cross-origin-write
checks; security headers; TLS/proxy requirements; and a single-worker persistent
SQLite deployment profile. These code/configuration checks do not establish that
an actual host has been provisioned correctly. `.env.example` contains
placeholders, is not a dotenv loader, and must not be blindly used as production
configuration. Source-package, container and server commands were not deployed.

Local `/api/health` and `/api/ready` returned 200 with active schedule coverage.
The QA server has no background push sender heartbeat; local readiness permits
this, while production readiness requires the supervised worker. Do not treat
local readiness as public-launch approval.

## Files changed

- `tests/frontend/routing-quality.browser.cjs`: explicit walking mode for each
  scenario, with existing bus/walk assertions retained.
- `tests/backend/test_routing_quality.py`: isolated faster-walk regression.
- `static/css/trip.css`: scoped foreground/background variables for contrast.
- `tests/frontend/features.browser.cjs`: inspect current worker cache.
- `README.md`: remove duplicate introduction, repair report link and link here.
- `docs/ARCHITECTURE.md`: current public navigation, walking and cache semantics.
- `docs/RUNBOOK.md`: repair report link and avoid stale version/action claims.
- `docs/RELEASE_READINESS.md`: this review and acceptance limits.

No route-engine code, backend API, schema, transit data, artwork, other page
layout, deployment configuration or dependency lockfile was changed. No files
were deleted. No commit, push, merge, rebase, branch deletion, tag, GitHub release,
settings change or deployment was performed.

## Release assessment and next steps

This is a reviewed local release candidate, not production certification.
Outstanding acceptance includes native Safari, physical iPhone/Android GPS and
permissions, human screen-reader/zoom review, slow-device animation performance,
external provider credentials/delivery, Linux/Docker with the pinned Python 3.12
image, HTTPS ingress, production secrets, moderation staffing, sender supervision,
monitoring and encrypted backup/restore on the intended host. Rule-based AYO AI
and unsupported pedestrian/Arrive By capabilities must remain honestly labeled.

1. Review `git diff --check`, `git diff --stat` and the detailed source changes.
   Visually check Trip in both site themes and review estimated-walking wording.
2. Complete physical-device/native-browser and human accessibility acceptance.
3. Decide repository visibility separately; the current instruction is to leave
   it public. Investigate/rotate credentials if any are later found in history.
4. Run the CI workflow on the intended Linux/runtime target after explicit
   publishing approval. Current local checks used Python 3.14.8/Node 24.11.0;
   configured CI uses Python 3.12/Node 22. Docker execution remains unverified.
5. Only after owner approval, commit/push the reviewed changes on
   `chore/restructure`; obtain separate approval for merge, release/tag or deploy.
   Do not run retained historical automatic-push scripts.
6. Before public application deployment, complete the operator prerequisites in
   [deployment](DEPLOYMENT.md) and [operations](RUNBOOK.md). Do not bypass
   readiness or production secret requirements to make the application start.

## Local evidence

Raw command logs and initial/final runs are retained under
`/private/tmp/ayo-release-results/` and `/private/tmp/ayo-release-*.log` on the QA
machine. These temporary files are not part of the repository and may disappear.
The test commands, source regressions, result table and limits above are the
portable record; historical archives are preserved separately. Live observations
are dated evidence and should be rerun before a later release.
