# Implementation and QA report

> Follow-up test maintenance: [browser test migration](BROWSER_TEST_MIGRATION.md). Six historical scripts are archived; two migrated suites now target the current interface. Earlier failure counts below are historical.

November 13, 2026 (America/Chicago). Branch: `release/integrated-transit`.
Scope: final master execution instructions following approved Phases A and B.
This is local implementation evidence, not production or physical-iPhone acceptance.

## Delivery

The application runs at **http://127.0.0.1:5001/** from the reorganized backend.
Two obsolete project processes were stopped after verifying their commands and
working directories. Temporary QA/TLS listeners are stopped after testing; the
single delivery listener is loopback-only. No public tunnel or LAN TLS listener
was enabled, no device trust installed, and no paid provider session was opened.

From the repository root, the startup command is:

```sh
.venv/bin/python scripts/dev_server.py --port 5001
```

The root `app.py` compatibility launcher and Gunicorn `app:app` remain supported.
Stop the current development process before starting another on the same port.
The server has no interactive debugger or automatic reloader.

## Implemented features

- **Divider bus:** a small inline SVG travels along the existing header border
  every ten seconds with four subtle smoke circles. A zero-layout clipping
  wrapper prevents horizontal overflow; no second divider or road was added.
  Home-only visibility, tab visibility and reduced motion are respected. No
  animation dependency or JavaScript animation interval was added. Defaults are
  configurable in `static/home-experience.js` through `AyoHomeSettings`.
- **AYO Voice:** permanent Home/Stops microphone shortcut opens the existing
  workspace and returns after closing. It accounts for safe areas, the virtual
  keyboard and arrival-notice overlap. Text questions use the existing validated
  transit APIs. Optional browser speech recognition supplies text to the same
  helper; spoken responses use speech synthesis with English/Spanish language
  settings. Recognition unsupported/denied/service-failure states are explicit.
  Capture stops on close, Stop, hiding the document or disconnecting. Compact
  controls keep Send, speech input and language selection accessible; secondary
  paid/mute/replay/clear controls stay in a disclosure. Actual microphone/audio
  delivery remains a physical-device acceptance item. Paid generative AI remains
  gated by existing credentials, authentication, spending and supervision controls.
- **Founder:** menu-accessible profile for Abhiraj Bandari with AB initials,
  Data Engineer title, Concordia University Wisconsin, Milwaukee, project mission,
  prior website/app experience, skills and actual Python/SQLite/Flask/Leaflet data
  pipeline. Professional skills are explicitly distinguished from deployed tools.
  No photographs, employment history, awards, profile links or metrics were invented.
- **GPS:** one explicit-action geolocation helper differentiates insecure
  context, unsupported API, permission denial, unavailable position and timeout.
  Nearby Stops, planner location buttons and retained nearby-vehicle logic reuse
  it. Manual search stays usable. No location is requested on page initialization.
- **Private HTTPS preparation:** existing cryptography support generates short-lived
  certificates under ignored `instance/dev-tls/`; PEM and public DER CA files are
  available. Strict TLS chain/hostname validation passed on loopback. Private paths,
  repository files, database paths and `/console` returned 404. The optional LAN
  development mode requires a private address and HTTPS and blocks operator
  moderation/readiness surfaces. Certificate trust and enabling the LAN listener
  are deliberate owner actions described in [IPHONE_TESTING.md](IPHONE_TESTING.md).
- **Mobile readability:** smaller visual bus markers retain 44px interaction
  boxes. Lightweight grid grouping at wide zoom retains individual marker objects
  and selected popups; zooming reveals individuals. Popups limit content height to
  35dvh. Freshness has a concise basic display and optional advanced controls/map;
  arrival-panel maps are shorter. Existing tools and backend functions remain.

## Verified bug causes and repairs

| Problem | Cause / final behavior |
| --- | --- |
| Planned Route 30 retained Route 19 | The old action drew geometry but never changed tracking state. Handoff now replaces the route state, clears unrelated positions while loading, and filters reported direction when available. Multi-leg route sets are supported; unknown direction is not invented. Explicit later route selection clears the previous journey overlay. Tests cover 19 → 30 → 19 and All Routes. |
| Distinct stops showed 0 min | GTFS trip 37805271, Route 30 direction 1, stops 416→417, sequences 27→28 publishes 17:03:00 for both. Source elapsed remains zero; backend annotates precision and UI says the same published minute has no reliable travel duration. No artificial minute was added. Midnight and source ordering remain intact. |
| Alert counts/error-to-zero | Independent snapshots/filter rules and empty rendering on failure. Backend route membership now includes actual stop-served routes; all frontend alert views bind the same last-good snapshot. Errors preserve known data with stale/source-time labels; unknown availability never claims zero. Valid empty feeds remain distinguishable. |
| Stale bus popup after failure | Failed fetches did not invalidate the previous freshness flag/content. Last-known markers now become stale and popups refresh their source age; unavailable counts do not reuse an unrelated route's count. |
| Rapid reload generated WebKit error | Weather attached an unhandled continuation to an abortable translation promise. Translation failure no longer becomes an uncaught weather promise; weather's own last-good/unavailable behavior remains. |
| WebKit Back position reset | Native restoration could compete with application restoration, and popstate/hashchange could process the same view twice. The existing router now owns per-entry positions, avoids duplicate handling, records state before navigation/page exit and ignores stale asynchronous view completions. Exact position restoration passes both engines. |
| Language-scroll test discrepancy | Locator.click moved the viewport before pointerdown; application correctly saved that changed value. The regression uses a real viewport pointer click and still requires the exact original 450px position. No workaround scroll timer was added. |
| Live journey layout assertion | Three desktop columns are the existing From / Swap / To design; the old expectation of two was outdated. The mobile one-column assertion remains. |

The original iPhone zero-duration trip's date/ID is unavailable; the exact matching
local GTFS candidate is reproducible, not asserted to be that historical device
request. Backend numeric times and metric calculation inputs are preserved.

## Structure and changed-file records

```text
AYOWhereMyBus/
├── app.py                         compatible launcher
├── backend/                       Flask application, data/services, guards
│   ├── app.py, paths.py
│   ├── release_api.py, feature_service.py, alert_service.py
│   ├── transit_engine.py, realtime_service.py, feed_http.py
│   └── stops_service.py, routes_service.py, push_service.py, moderation_service.py
├── index.html
├── static/
│   ├── app.js, journey.js, workspaces.js, navigation.js
│   ├── weather.js, rider-tools.js, pwa.js
│   ├── location-access.js, alert-store.js, home-experience.js
│   └── units, localization, styling, icons, manifests, sw.js, vendor/
├── tests/backend/, tests/frontend/, tests/fixtures/
├── scripts/                       operations plus examples/tools
│   └── dev_server.py, prepare_dev_https.py
├── google_transit/                unchanged required source timetable
├── instance/                      ignored original data and private TLS files
├── archive/legacy/                preserved obsolete sources
├── docs/, deploy/, .github/workflows/
└── standard root configuration and dependency manifests
```

[PHASE_B_MOVES.json](PHASE_B_MOVES.json) retains all 55 approved moves.
[IMPLEMENTATION_CHANGES.json](IMPLEMENTATION_CHANGES.json) lists every new/modified
source file relative to the verified Phase B package. There were no additional
source moves/deletions in this continuation. An initial generated, never-trusted
certificate set was retained privately as `instance/dev-tls-initial-untrusted/`
after strict verification exposed missing key identifiers. The corrected set
passed strict verification; no security bypass was used.

CI now invokes unique maintained suites rather than repeating aliases. Existing
compatibility npm commands remain, new checks have explicit commands, and every
frontend script is syntax checked. Remote CI was not triggered. Dependency locks,
Gunicorn, Dockerfile, deployment secrets/settings and data locations remain intact.

## Automated results and limits

| Verification | Actual result |
| --- | --- |
| Backend suite | **113 passed**: Phase B's 109 plus four focused transit/filter tests |
| Node suite | **26 passed**: Phase B's 23 plus location/shared-snapshot tests |
| Aggregate `AYO_REDESIGN_AXE=1 npm run test:release` | **Passed**: responsive, advanced, PWA and new feature suites |
| Responsive/bilingual matrix | **12 passed**, widths 320/390/1440 in Chrome/WebKit, both themes |
| Main accessibility scans | **144 scans, zero detected violations**; additional Voice/Founder and live-route scans also passed |
| Weather | **168 condition cases and 12 cold-failure cases passed** |
| New feature suite | Both engines passed: 220 synthetic vehicles, grouping/selection, popup bounds, direction-aware handoff, six GPS states, English/Spanish speech adapters/denial/unsupported fallback, shared alerts, saved-journey reload, founder, notice-safe shortcut and reduced motion |
| Real-GTFS browser suites | **All three passed**: journey, routing quality, workspace handoffs; isolated processes/stores avoid shared rate budgets |
| Navigation/SVG/units/map | Updated current-interface suites passed in their configured engines/viewports |
| Browser script inventory | **22 attempted: 14 passed, 8 historical scripts failed**; no all-green claim |
| API contract | All **33 route rules/methods/endpoints unchanged** and exercised with reads or empty guarded writes in an isolated database; no unexpected server errors |
| Actual port 5001 | Read-only source/API smoke checks passed; new assets match disk bytes; typed Route 19 responses worked in fresh Chrome/WebKit profiles, with no uncaught page errors |
| Existing databases | Both original SQLite files passed read-only full integrity checks |
| HTTPS | Strict chain/hostname verification passed; no system trust change, public tunnel or LAN TLS listener |
| Packaging/static checks | Python/JS syntax, Leaflet integrity/source-map JSON, preserved backup archive hash and unchanged Git HEAD verified |

Test traffic uses isolated fixtures/profiles/databases where stated. Synthetic
vehicle positions and speech adapters are never production data or proof of
native microphone/audio service delivery. Readiness in development is not
production readiness. Native iPhone/VoiceOver, actual audio and remote CI remain
unverified. Current real-data snapshots can change with feed/calendar conditions.

### Eight retained historical browser failures

- `clock.browser.cjs` and `clock.live.browser.cjs`: require clock elements absent
  from the approved utility interface. Retained guarded clock code was not deleted.
- `weather-time.browser.cjs`: requires that retired clock/header layout and an
  obsolete `--°F` failure placeholder.
- `controls.browser.cjs`: operates menu controls without opening the current menu.
- `features.browser.cjs` and `full-release.browser.cjs`: expect the planner visible
  on initial Home rather than navigating to Trip.
- `workspace-failures.browser.cjs` and `workspaces.browser.cjs`: expect retired
  feature-card entry controls.

These were already failing before this implementation and were not removed,
skipped by the all-script audit, or made green by weakening their assertions.
Their raw failures are preserved. Remaining maintenance is to migrate their
historical UI contracts while retaining relevant behavioral coverage. The maintained
current suites already cover those features, but not every historical assertion.

Updated test expectations are documented: three actual desktop planner columns;
explicit navigation to current screens; new permission-error wording; current SVG
assets instead of removed decorative bats; correct weather failure semantics;
and source-specific real walking legs rather than a time-dependent assumption that
walking-only must always rank first. The deterministic journey fixture still
requires and verifies walking-only behavior. No prediction/security/expiry guard
was relaxed to obtain passing results.

## iPhone and owner actions

See [IPHONE_TESTING.md](IPHONE_TESTING.md) for exact trust, startup, permission,
PWA and non-destructive preference-transfer steps. The Mac's private address was
confirmed as **192.168.1.33**. The prepared server certificate includes that
address, 127.0.0.1 and localhost. The public DER CA is `instance/dev-tls/ca.cer`;
never transfer private keys. Do not trust the archived initial certificate set.

After explicitly reviewing/installing/full-trusting the current CA on the iPhone,
stop the current loopback server and deliberately enable private LAN HTTPS:

```sh
.venv/bin/python scripts/dev_server.py --port 5001 --host 192.168.1.33 --https
```

Then open **https://192.168.1.33:5001/** on the same trusted Wi-Fi with no
certificate warning. This command was prepared, not executed. No public exposure
or new external account is required. Keep manual stop search available and verify:

- Allow/deny location; real nearby directional stops; manual fallback and timeout.
- Typed and spoken supported questions; English/Spanish; mic denial/unsupported
  messages; audible readout; Stop/close/background capture termination.
- Home button visibility/safe areas, keyboard and arrival-notice clearance.
- Divider animation, Reduce Motion, tabs, history and founder content.
- Home Screen installation/update, offline honesty and saved preferences after
  closing/reopening. HTTP/HTTPS are separate origins; do not clear the old data.

Paid AI would additionally require credentials/account capability, trusted server
authentication, operator spending approval and provider/device acceptance; it
remains disabled. Existing moderation, hosting, native-push and recovery gates in
the launch documents remain operational requirements. No production deployment or
physical-iPhone success is claimed.

## Backup and evidence

The original verified backup remains at:
`/Users/bandariabhi/Desktop/AYOWhereMyBus-backups/phase-a-20261113T235149Z/`.
Its archive hash and original Git commit were reverified. All original files are
accounted for through the Phase B mapping; no valuable source or rider data was
deleted. Existing browser storage keys are unchanged and fixture persistence tests
pass; the owner's physical-device storage was not read or erased.

Raw current logs, screenshots, API/contract metadata, test inventory and verified
source package are preserved privately under the Desktop backup parent in
`final-execution-evidence-20261113/`. No dependencies were installed, no commits or
pushes made, and no public service, deployment, device trust or paid account enabled.
