> Current status and validation: [LAUNCH_READINESS.md](LAUNCH_READINESS.md). This earlier implementation report is historical.

# Integrated release report

Implemented locally on `release/integrated-transit`. This is a reviewable integrated release candidate, not a certified production deployment.

The coordinated [journey planner follow-up](JOURNEY_PLANNER.md) adds named location suggestions, Use My Location, readable itineraries and trip map layers. It also records the current backend and real-browser QA results; it supersedes the initial planner and browser-verification notes below.

## Completed functionality

- Existing cinematic homepage, art, bus search/map, weather, nearby stops, scheduled destinations and creator section retained.
- SQLite schedule index and indexed stop-route lookup. Calendar/calendar_dates support, removal exceptions, Chicago service timezone, DST-safe GTFS service-time anchor, previous-day 24+ hour trips, pickup/drop-off restrictions, explicit scheduled labels and empty-service fallback.
- Live vehicle API adds trip ID, GPS age, feed freshness and reliability labels. Nonfinite positions/speed/bearing are rejected or omitted. No positions become arrival estimates.
- GTFS-Realtime adapter validates protobuf, full-dataset semantics and timestamps, caches with bounded lifetime, matches trip/stop events, handles dated cancellation/skipped-stop updates and active service-alert windows. MCTS's undated trip updates are matched through absolute events within six hours of the scheduled occurrence. Missing, stale, invalid or mismatched data falls back to labeled schedules.
- Stop search, departures, favorites stored on device, route shapes, selected-stop map marker, official external walking directions. Nearby-stop cards connect to the same rider tools.
- Bounded scheduled stop-to-stop planner with up to two rides, 400m estimated transfer walks, two-minute transfer allowance and an eight-second search budget. No claim of exhaustive routing or realtime itinerary feasibility.
- Winter Watch: plain text only, valid stop required, pending-by-default moderation, authenticated review API, approved-only public listing, per-browser up/down vote, 24-hour visibility expiration. SQLite persistence, write budgets, no public reporter identity.
- Page-open browser notifications from future matched predictions within five minutes; never scheduled-only notifications. AYO Voice reads the same labeled departures via browser text-to-speech in English or Spanish.
- Bilingual new rider controls and readout, existing bilingual homepage strings retained; language changes reload the page. Responsive controls, accessible labels/status regions, focus styles and skip link.
- PWA manifest, generated code-native PNG icons, service worker with offline shell. API responses are never cached by the worker.
- JSON-object validation, size limits, cross-origin write checks, SQLite-backed shared request budgets, security headers, production debug disabled. Dockerfile, environment example, Gunicorn launch and CI test workflow.

## Actual verification

17 unittest executions passed, including extended GTFS times, exclusion dates, DST anchor, transfer routing, shapes, invalid stops, exact and undated event matching, stale/mismatched prediction fallback, upstream failure, invalid vehicle GPS, moderation/authentication, idempotent votes, bad inputs, rate limits, cross-origin writes and shell endpoints. Four schedule cases are also inherited by the API test class.

JavaScript syntax checks passed for app.js, stops-ui.js, release.js and sw.js. Python compile checks passed. Real bundled index built successfully. Direct journey sample 1650 → 7838 returned a scheduled 44U ride in approximately 0.5 seconds.

Read-only live verification on November 9: 209 vehicles; fresh trip feed with 394 entities; 3 matching predictions across 25 sampled stop-event lookups; fresh service-alert feed with 8 active alerts. See `live-verification.json`. Counts are observations, not promised future service. MCTS's `/tripupdates` endpoint did not decode as GTFS-RT; implemented `/gtfsrt/trips` was verified instead.

## Limitations and remaining launch gates

- The journey follow-up now has headless Chrome, keyboard/location/failure-state and responsive layout tests at three widths. See JOURNEY_PLANNER.md for results and limits. A screen-reader audit, real notification delivery, audio and device PWA installation remain unverified.
- English/Spanish support is partial across the entire legacy site: new core controls/readouts support both; some legacy help, creator copy, status/error text, itinerary metadata and upstream English alerts remain English. Full translation review remains required.
- Planner UI accepts searchable GTFS stop names/intersections and nearby-stop suggestions; it keeps IDs internal. Arbitrary address geocoding is unavailable. Use the official MCTS planner link for addresses, more transfers and broader searches. Walking is straight-line estimation, not turn-by-turn or verified accessible routing. Search caps can omit alternatives. Agency transfer rules, frequency service and accessible pathways are not imported. Plans are scheduled and can be disrupted; review alerts.
- Service-day matching without a supplied realtime start_date is conservative. Undated cancellations/skipped stops are not inferred. Delay-only updates, added/unscheduled trips, frequency trip instances and propagated downstream delay are not converted into predictions. Early/late trips outside the two-hour scheduled query window can be missed.
- Arrival alerts stop when the browser suspends/closes the page; background push needs push subscriptions, a scheduler and delivery infrastructure. TTS depends on device voice availability; there is no speech recognition or generative assistant.
- Anonymous browser cookies and request budgets deter casual duplicate voting; clearing cookies or changing IP can bypass them. SQLite supports a single deployment with persistent local storage, not independent replicas. A trusted ingress must enforce client-IP limits if a proxy hides addresses. No global distributed rate limiter or abuse service is configured.
- Reports expire from public view after 24 hours; database retention cleanup/backups and a staffed moderation process remain operator responsibilities. A moderation API exists; there is no moderator dashboard. Without MODERATOR_TOKEN, submissions safely remain pending.
- Docker image, Gunicorn runtime, CI hosted execution, TLS and deployment have not been run here. Dependency ranges are bounded but not a supply-chain lockfile. Load/concurrency/security penetration testing remains required before a production claim.
- Schedule refresh, monitoring, external-map/weather availability and data-provider terms need operational ownership. No occupancy values or fabricated disruption/arrival data are supplied.

See DEPLOYMENT.md for local startup and launch requirements. Nothing has been pushed or deployed.
