# Home location search and AYO AI

The existing local development command remains:

```sh
.venv/bin/python scripts/dev/dev_server.py --port 5001
```

Open http://127.0.0.1:5001/ for Stops or http://127.0.0.1:5001/ai for text chat.

## Optional address and place lookup

Official MCTS stop, stop-ID and intersection search uses the existing GTFS APIs and does not require geocoding credentials. Results are labeled as official stops/intersections, not as verified street addresses.

Full address/place search uses the optional server-side Geoapify Geocoding API. Set `GEOAPIFY_API_KEY` in the application process environment to enable it. No credential is sent to JavaScript or returned by `/api/location-config`. No production environment, deployment settings or key files were changed by this implementation. No real key was available during testing.

After entering an address, press Search locations. Partial typing offers local official-stop suggestions; external address queries are sent only on explicit submission. The configured provider supplements rather than replaces GTFS results. Queries use US filtering and Milwaukee proximity bias, with English/Spanish output, six-result limits, a six-second upstream timeout and at most two concurrent upstream calls. Existing API request budgets also apply. Queries are sent to the local endpoint as POST JSON to avoid placing full addresses in normal access-log URLs. Application code does not persist geocoder results or log upstream URLs containing credentials. Operators should also avoid body logging in proxies or observability tools.

Provider/data attribution is displayed beside the results. Use the operator's own Geoapify plan and observe its current quotas and attribution terms:

- [Geoapify Geocoding API](https://apidocs.geoapify.com/docs/geocoding/)
- [Geoapify usage and attribution](https://www.geoapify.com/geocoding-api/)

If configuration is absent, the interface explains that full address search is unavailable. If the provider fails, verified GTFS matches remain usable. Arbitrary typed text is never converted to coordinates without selecting a returned location. Precise GPS coordinates are not stored in favorites or Home preferences.

## Text assistant

AYO AI is a rule-based helper, explicitly labeled as such. It uses no general-purpose AI model, paid AI API, speech recognition, text-to-speech or microphone. The floating chat button, its greeting and the primary AI tab all open `/ai`.

The UI supports English/Spanish, suggested questions, Enter to send, Shift+Enter for a newline, session-local history and New Chat. Only the conversation pane scrolls as replies are appended. History is bounded to 60 messages and retained in sessionStorage for that browser tab; New Chat clears it. Do not enter sensitive personal information.

`static/js/assistant.js` implements the reply contract independently of the UI. A later server-side AI integration can replace that adapter while retaining the chat interface. General guidance links to existing Stops, Trip, Alerts and Founder destinations. Explicit `stop 1234` / `parada 1234` queries use existing official-stop and departure APIs. Feed and prediction timestamps are qualified using the shared transit presentation logic. Stale predictions fall back to published schedules, and failures report unavailable data. Replies containing transit observations are timestamped and explicitly described as saved observations, not auto-updating live displays.

## Weather and time

The header clock uses the existing shared minute-aligned updater; no independent clock timer was added. Milwaukee uses America/Chicago by default. Selecting a new location updates Open-Meteo weather after a short debounce; a valid returned time zone updates the header clock. Until the provider or selected result supplies a valid zone, the clock retains America/Chicago. The shared formatter retains Milwaukee time for any footer clock element.

Weather refresh remains every 15 minutes while visible/online, plus reconnect and selected-location changes. Stale requests cannot overwrite a newer location. Failure shows a qualified last observation only if recent enough, otherwise an unavailable state and neutral symbol; time keeps updating. No temperature or conditions are invented.

## Verification and limits

Automated tests mock external weather/geocoding providers and test the real local application routes. This verifies integration contracts, not a credentialed Geoapify account or a physical iPhone GPS session. Chrome/WebKit coverage does not establish native Safari or physical iPhone/Android acceptance.

Relevant commands:

```sh
npm test
.venv/bin/python -B -m unittest discover -s tests/backend
npm run test:home
npm run test:chat
```

Browser tests use `AYO_TEST_URL` for an existing isolated local server and the installed Playwright browser paths. Do not install dependencies or change production configuration to run them without approval.
