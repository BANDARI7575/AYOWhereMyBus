# Local staging on macOS

1. Open Docker Desktop and select **Containers**.
2. Start **ayo-local-staging**. Wait for **app**, **alerts**, **geoapify**, **mcts**, and **proxy** to become healthy.
3. Expand the project and click the proxy’s **8080** published port. Your browser follows the redirect to `https://127.0.0.1:8443`. Use **8080** as the entry point from Docker Desktop.
4. To shut down, click **Stop** on the project row. Keep the project and its volumes so you can use **Start** again after restarting your Mac.

Docker Desktop starts the existing containers with their saved configuration. The same workflow applies after a Mac restart. The restart policy also restores containers that were running when Docker shut down. A project you stopped manually stays stopped until you start it.

## One-time setup or container recreation

From the checkout root, run the following after provisioning the state and TLS volumes and staging credentials. An existing installation already has these volumes and credentials.

```sh
docker compose -f deploy/compose.local-staging.yaml up -d --build --wait --wait-timeout 150
```

Compose defaults to `~/.ayo-staging/staging.env` and `~/.ayo-staging/secrets/`. Keep the directory private (mode 700), with the env file and keys restricted (mode 600). The env file supplies staging-only moderator and privacy credentials, support contact, retention approval, backup encryption, the VAPID public key and subject, and push encryption. The read-only secrets mount supplies `vapid-private.pem`. For a different approved location, pass `--env-file` with the existing external `compose.env` containing the path overrides when recreating the containers. Daily Start and Stop require no env file flags or shell exports.

On a fresh installation, provision `ayo-local-staging_state` with a validated `schedule.sqlite` matching the bundled GTFS, writable by container UID 10001, and create `ayo-local-staging_tls` before running the setup command. For schedule validation and staging, see [Deployment](DEPLOYMENT.md#data-and-configuration). On this Mac, reuse the existing volumes. The state volume contains both SQLite databases and the TLS volume holds Caddy’s local CA and renewable certificates. Both volumes are external to the Compose lifecycle.

### Browser trust

Trust the existing staging CA once for the current macOS user. Export only the public certificate directly from the local proxy and add it to your login Keychain for TLS. macOS may ask you to authorize the Keychain change. This trusts certificates issued by this CA for TLS, so keep its private key in the protected Docker volume.

```sh
cert_dir="$(mktemp -d)"
docker cp ayo-local-staging-proxy-1:/data/caddy/pki/authorities/local/root.crt "$cert_dir/root.crt"
security add-trusted-cert -r trustRoot -p ssl \
  -k "$HOME/Library/Keychains/login.keychain-db" "$cert_dir/root.crt"
```

Use a browser that honors macOS login Keychain trust. Keep the TLS volume across starts so the CA stays the same. [Caddy local HTTPS documentation](https://caddyserver.com/docs/running#local-https-with-docker)

### Release browser suite over HTTPS

Playwright navigates in the browser, but its `page.request` API makes HTTPS requests from Node. Browser trust does not automatically install the private staging CA in Node's trust store. If the PWA suite reports `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` on the Leaflet source-map request, run it with the public CA exported above. Keep TLS verification enabled.

```sh
NODE_EXTRA_CA_CERTS="$cert_dir/root.crt" \
AYO_TEST_URL=https://127.0.0.1:8443 npm run test:release
```

During Phase 1, the utility redesign suite also recorded an intermittent Playwright WebKit access-control error for `/api/buses?route=19`. That test intercepts the request and returns a synthetic fixture. The error did not recur in the full HTTPS rerun with Node's CA configured. Separate unmocked same-origin requests in Chrome and WebKit both returned HTTP 200 and a fresh Route 19 feed. The exact trigger of the one-off error remains unconfirmed. Keep the browser error assertion enabled. If it recurs, compare the fixture run with an unmocked same-origin request before diagnosing a staging API or CORS failure.

## iPhone over private Wi-Fi

On the configured Mac, AirDrop `~/.ayo-staging/AYO-iPhone-WiFi.mobileconfig` to the test iPhone. The profile contains the public Caddy staging root certificate. In iPhone Settings, install it under **General → VPN & Device Management**, then turn on full trust for **AYO! Staging Root CA** under **General → About → Certificate Trust Settings**. Open [AYO! in Safari](https://bandaris-macbook-air.local:8444/) while both devices are on the same trusted Wi-Fi. Tap **Enable My Location** and allow the Safari site prompt. [Apple certificate trust instructions](https://support.apple.com/en-us/102390)

The macOS user LaunchAgent `local.ayo.staging-wifi` starts automatically at login. It listens on the configured Wi-Fi IPv4 address and admits connections from the configured subnet, excluding the gateway. It forwards TLS to Docker’s loopback port 18444. Caddy terminates TLS with a matching Bonjour hostname certificate, applies the staging security policy, and blocks readiness and moderation endpoints on the Wi-Fi hostname. The LAN listener has no IPv6 binding. The Mac’s original localhost entry point is still available.

Keep the Mac on the configured trusted network. If the Wi-Fi address, subnet, or gateway changes, update the LaunchAgent’s arguments and reload it for the new network. If the Bonjour hostname changes, update `AYO_WIFI_HOST` in the external Compose env file and recreate the project once using that env file. Docker Desktop Start uses the saved configuration for daily use. The phone uses its own origin for browser settings and saved data.

## Geoapify walking directions

Store a dedicated Geoapify Free plan server key in `geoapify-routing.key` inside the existing external staging secrets directory. Keep the file at mode 600. Use the Geoapify project dashboard to restrict the key to your outbound public IP if it is stable. The app reads the file on each consented request, so adding or rotating the file does not require rebuilding or restarting Docker. With no readable key, the Apple Maps and Google Maps links remain available.

The app reaches an unpublished relay over a dedicated internal network. The relay contacts only Geoapify’s pedestrian routing and OSM Carto raster tile endpoints over HTTPS, with redirects and inherited proxy settings disabled. The app and alerts worker retain their existing network isolation, and staging address search stays disabled. The database reserves at most 500 routing requests and 1,200 tile requests per UTC day (up to 300 tile credits). The relay spaces upstream requests at least 260 milliseconds apart across both endpoints. The walking map loads tiles for the visible area only after route consent. Live bus maps use the same tile endpoint and budget when displayed. The browser requests tiles from the app and caches them privately for one hour. Geoapify receives tile indices for the map area without the rider’s IP or exact route coordinates on tile requests. Docker access logs omit query strings, including tile indices. [Geoapify pricing and limits](https://www.geoapify.com/pricing/)

## Live MCTS data

The unpublished `mcts` relay fetches only the three fixed HTTPS GTFS-Realtime endpoints for vehicles, trips, and alerts. These feeds require no credentials. The relay caches each response for 15 seconds, briefly backs off on failures, and rejects redirects, caller-supplied URLs, and query strings. The app and alert worker connect on an internal network. The relay receives no rider coordinates or browser requests. [MCTS developer terms](https://www.ridemcts.com/policies/developer-terms)

AYO uses the upstream timestamp to flag stale feeds and presents only verified stop predictions as real-time. Vehicle tracking requires a uniquely matched trip and active service date. Scheduled departures remain available when predictions are missing. Community alerts and opt-in push settings remain separate.

## Checks and recovery

- If the page is unavailable, check that all five containers are running and that the proxy is healthy. `/api/health` checks the web process. `/api/ready` checks the databases, active scheduled service, and the worker heartbeat.
- If readiness reports an inactive schedule, prepare and audit an updated GTFS index before replacing the active index. Keep the existing index and its matching source as a recovery copy.
- Keep `~/.ayo-staging/` and both external volumes in protected storage. Previously encrypted records and backups require the original keys. Current keys validate current startup and provide no assurance of recovery for older ciphertext.
- All Docker published ports bind to Mac loopback. The app and worker share an internal Docker network, and paid provider keys are disabled. The browser can fetch live weather from `https://api.open-meteo.com`, the only external origin in staging's `connect-src` policy. Other automatic third-party browser fetches remain blocked. If the weather provider is unavailable, scheduled transit and other local features remain available.
- Keep credential files outside the checkout and out of Git, Docker build contexts, and shared logs.
