# Leaflet map layout regression

Checkpoint: 31173be, branch release/integrated-transit. Fixed locally; no deployment, push or merge.

## Root cause

The Leaflet stylesheet link declared SHA-256 `p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`, but the committed local CSS bytes hash to `M3v8pcq9A7OYFbJwD+vis7ft9VkhxZzUn4jssyghIwM=`. Chromium reproduced an explicit integrity rejection before the change. The script hash was correct, so Leaflet initialized without its required tile positioning and container clipping styles. This accounts for disconnected tiles and painting outside the map into later sections.

## Changes

Corrected the CSS integrity value while retaining integrity protection; explicitly confined the map's positioned layers and stacking context with position:relative, overflow:hidden and isolation:isolate. Advanced the service-worker shell namespace to v6 so the corrected HTML/CSS is available on an offline reload after the new worker is activated. The existing update prompt/lifecycle remains intact. Homepage artwork, typography, creator section and transit logic were not changed.

Added `tests/assets.test.cjs` to compare actual shipped asset bytes with HTML integrity declarations. Added `npm run test:map` and CI coverage using the real local Leaflet stylesheet/script. The browser regression substitutes deterministic tile images and isolated API responses; it tests rendering, not live feed accuracy or cartographic tile availability.

## Verification

- Before fix: Chromium rejected the stylesheet with the expected computed digest and the map regression failed.
- After fix: Chromium and Safari-engine WebKit passed at 1440, 390 and 320px; verified stylesheet acceptance, absolute tile positioning, clipping with the map visible, pan/zoom, viewport resize and no document horizontal overflow.
- 75 backend unittest executions passed.
- 11 Node tests passed, including new asset-integrity regression.
- 9 feature contracts passed, including real service-worker shell caching, uncached transit APIs and offline reload/banner with v6.
- `git diff --check` passed.

WebKit automation is not a test of the user's physical Safari device/profile. On an already-open Safari tab, reload while online; if an update prompt appears, activate the new version. No site-data deletion is required by this fix. Public launch gates in LAUNCH_READINESS.md remain unchanged.
