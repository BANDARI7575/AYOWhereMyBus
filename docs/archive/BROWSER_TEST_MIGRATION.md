# Browser test maintenance — November 13, 2026

This follow-up changes tests, CI verification commands and documentation only.
No application code, design, storage, certificates or deployment settings changed.
The earlier 22-script result (14 passed, eight failed) remains a historical receipt;
this work does **not** retroactively turn those failures into passes.

## Disposition of the eight failures

| Previous script | Disposition and retained coverage |
| --- | --- |
| `clock.browser.cjs` | Archived unchanged. Its rendered-clock contract has no target in the approved utility interface. Current served-byte/cache-repair/source-map assertions now run in `redesign-pwa.browser.cjs`; SVG validity runs in `svg.browser.cjs`. |
| `clock.live.browser.cjs` | Archived unchanged. No rendered clocks exist to observe across real minute boundaries. No claim of a current two-clock pass is made. |
| `weather-time.browser.cjs` | Archived unchanged. Requires removed clock/header elements and an obsolete failure placeholder. Current weather timestamps, last-good cache and cold failures are tested in `weather.browser.cjs` and current-interface coverage. |
| `controls.browser.cjs` | Archived unchanged. Depends extensively on former hero, feature-card and mobile-navigation controls. Current navigation, theme, language, map, stop and disclosure controls are covered by the maintained redesign, completion, scroll and advanced suites. This is coverage of current workflows, not a one-to-one assertion migration. |
| `full-release.browser.cjs` | Archived unchanged. Assumes the old single-page layout and former Winter Watch form. Current release tests cover the approved screens; backend tests retain moderation/report API coverage. The absent historical report form is not claimed to have passed a current UI test. |
| `workspaces.browser.cjs` | Archived unchanged. Assumes feature-card entry points, persistent dialog navigation in Voice and former always-expanded diagnostics. Current redesign/advanced/completion/live-workspace suites cover active workflows. Its entire historical 24-case matrix was not rerun or claimed equivalent. |
| `features.browser.cjs` | Migrated and expanded to Chrome **and** WebKit. Opens current stop actions; checks corrupt stored favorites, source-labeled readout, scheduled/stale-feed/stale-prediction/invalid-uncertainty notification suppression, fresh notification and deduplication, uncached APIs and offline reload. Historical absent report-form assertion is explicitly separated from backend API coverage. Original saved before editing. |
| `workspace-failures.browser.cjs` | Migrated to current Nearby entry, Voice disclosure/close-and-return and Data freshness disclosure. Retains denied GPS, pagination, late-success/late-error suppression, blocked storage, duplicate/multiple alerts, stale suppression, threshold trigger, denied microphone with zero provider requests, reorder/remove/confirmation and offline behavior. Adds uncaught JavaScript error assertions. Original saved before editing. |

All six archived scripts remain in `archive/legacy/tests/frontend/`. Their original
relative imports assume their former location; these are forensic source copies,
not supported commands from the archive. Do not execute the unsafe legacy
`auto_push.sh`. Exact moves and unchanged hashes: [move inventory](BROWSER_TEST_MIGRATION.json).
Original failures remain in the private final-execution evidence folder.

## Commands and results

- `npm test`: **26 passed**, zero failures/skips.
- `npm run test:failure-recovery`: **passed**; both migrated suites passed in Chrome and WebKit (four suite/engine combinations), with no uncaught JavaScript errors.
- `node tests/frontend/redesign-pwa.browser.cjs`: **passed** in both engines; verifies workspace
  JavaScript equals controlled-page response bytes, `no-cache` headers, repair of a
  deliberately stale v26 cache entry, a single app script, Leaflet source-map JSON,
  precached shell/no API caching and usable offline Trip/Map navigation.
- JavaScript syntax checks passed for the three changed scripts.

Set `AYO_TEST_URL` to the running local app (currently `http://127.0.0.1:5001`),
`PLAYWRIGHT_BROWSERS_PATH` to the existing browser cache and `AYO_CHROME_PATH` to
installed Chrome as appropriate. No dependencies were installed. CI now explicitly
runs failure recovery; remote CI was not triggered.

The active browser inventory is **16 scripts**, six originals archived. Fourteen
had passed the preceding audit; the two migrated scripts are tested in this
follow-up. This is not a fresh rerun of all 16. Only tests/metadata changed, so the
application source revision and prior backend verification remain applicable.
Physical Safari/iPhone audio, GPS, VoiceOver and certificate trust remain owner
acceptance steps. Browser speech/microphone behavior here uses controlled adapters.
