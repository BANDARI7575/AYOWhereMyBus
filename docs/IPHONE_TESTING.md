# Private HTTPS, iPhone GPS and Voice testing

HTTP `http://192.168.1.33:5001` is not a secure context. iPhone geolocation and
microphone APIs require trusted HTTPS and device/browser permission. Desktop
loopback HTTP is a special case and does not establish iPhone compatibility.

No tunnel or public listener has been created, no trust installed, and no paid
Voice provider enabled. These steps require the device owner's explicit trust
approval. Do not bypass a certificate warning or distribute a private key.

## Already prepared locally

`scripts/prepare_dev_https.py --ip 192.168.1.33` prepared a private CA and a
14-day server certificate in ignored `instance/dev-tls/`, with private file
permissions. This uses the existing cryptography dependency, not a new package.
CA trust expires in 30 days. Never commit or transfer `*.key` files. Certificate
creation neither installs trust nor opens a server port.

If the Mac's LAN IP changes or certificates expire, create a NEW directory:

```sh
.venv/bin/python scripts/prepare_dev_https.py --ip YOUR_PRIVATE_IP --output instance/dev-tls-next
```

Existing keys are never overwritten. Do not reuse this development CA for
production. Do not forward the router port or run an external tunnel.

## User actions required on iPhone

1. Verify the Mac's current private address is `192.168.1.33`; connect both devices
   to the same trusted Wi-Fi. A guest network may isolate devices.
2. Review `instance/dev-tls/ca.cer`, then transfer **only that public DER certificate**
   through a trusted local method such as AirDrop. Verify its SHA-256 fingerprint
   against the script's output before trusting it.
3. Install the received profile in Settings → General → VPN & Device Management.
4. In Settings → General → About → Certificate Trust Settings, explicitly enable
   full trust for this AYO development CA. This is a security-sensitive decision
   the owner must make; the application never changes device trust settings.
5. Stop the existing development server on port 5001 in its terminal, then start:

```sh
.venv/bin/python scripts/dev_server.py --port 5001 --host 192.168.1.33 --https
```

6. Open **https://192.168.1.33:5001/** in Safari. There must be no certificate
   warning. The LAN listener requires HTTPS and blocks operator moderation and
   readiness surfaces; it has no interactive debugger and exposes no repository
   directory or database files. This is private development only, not deployment.
7. Tap Nearby Stops, allow location for this website, and confirm real nearby
   directional stops. Manual stop search remains available for every error.
8. If denied, inspect Safari's website Location permission and iOS Settings →
   Privacy & Security → Location Services → Safari Websites. Retry deliberately;
   the app does not repeatedly request location on load.
9. Open AYO Voice with the floating Home microphone. Type `Route 19 buses` or
   `alerts`. Choose English/Spanish. Tap **Speak a transit question** only if the
   browser supports recognition. Your browser may process audio using its own
   speech service; the notice appears before starting. Verify permission denial,
   recognition errors, spoken readout, Stop and text-only fallback.
10. Paid AI conversation is separate and remains gated by authentication,
    credentials and operator spending approval. No native speech success implies
    that paid AI is enabled or that arbitrary questions are supported.
11. Add the HTTPS site to the Home Screen and repeat GPS, voice, closing/reopening,
    saved journeys and language/theme checks. Check safe areas, keyboard, floating
    button and animation with Reduce Motion enabled.

Favorites, language, PWA workers and certificates are origin-specific: HTTP and
HTTPS installations do not automatically share storage. Do not erase old site
storage or uninstall an old PWA to troubleshoot. Keep it until any wanted data
has been transferred deliberately. No automatic origin migration is performed.

For desktop-only HTTP use `.venv/bin/python scripts/dev_server.py --port 5001`.
When private device testing ends, stop that LAN listener and remove the optional
CA trust/profile from the device if no longer wanted. Retain private backup data.

References: [Apple certificate trust](https://support.apple.com/en-us/102390),
[MDN geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API),
[MDN speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Physical iPhone/Safari/PWA acceptance is not established by desktop WebKit tests.

## Optional preference transfer between HTTP and HTTPS

The existing HTTP origin's data is retained. The new HTTPS origin cannot read it.
If you want to transfer favorites, use the old site's Web Inspector while its
page is still available and export only these application keys (no cookies,
permissions, microphone data, or session credentials):

```js
JSON.stringify(Object.fromEntries(
  ['ayo-favorites','ayo-stops','ayo-workspace-favorites','ayo-language','ayo-day-mode']
    .map(key => [key, localStorage.getItem(key)])
))
```

Copy the returned JSON into a private local file. Keep the original site data.
For an **empty** destination only, open the trusted HTTPS site and use its Web
Inspector to import your own export:

```js
const allowed = ['ayo-favorites','ayo-stops','ayo-workspace-favorites','ayo-language','ayo-day-mode'];
if (allowed.some(key => localStorage.getItem(key) !== null)) {
  throw Error('Destination already has preferences. Merge separately; do not overwrite them.');
}
const saved = JSON.parse(prompt('Paste your own AYO preference export'));
const entries = allowed.filter(key => saved[key] !== null && saved[key] !== undefined)
  .map(key => { if (typeof saved[key] !== 'string') throw Error('Invalid export');
    JSON.parse(saved[key]); return [key, saved[key]]; });
entries.forEach(([key, value]) => localStorage.setItem(key, value));
location.reload();
```

This is a deliberate owner action, not an automatic migration. If the old page
is no longer available or the destination already has saves, retain both origins
and request a non-destructive merge rather than clearing storage. Do not paste
exports from other people or publish the file; saved labels may be personal.

The current HTTP process may be owned by the coding session rather than a VS Code
terminal. Before switching its port to HTTPS, inspect
`lsof -nP -iTCP:5001 -sTCP:LISTEN`, verify the listed Python command is this
project's `scripts/dev_server.py --port 5001`, and stop only that PID (or ask the
coding session to stop it). Then run the HTTPS command above.
