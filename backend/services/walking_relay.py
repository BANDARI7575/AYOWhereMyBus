"""Private Docker ingress for the fixed Geoapify routing and street tile endpoints."""
import asyncio
import threading
import time
from urllib.parse import urlencode

from flask import Flask, Response, request

from backend.services.feed_http import _download
from backend.services.walking_service import PNG_SIGNATURE, TILE_MAX_BYTES, meters, point, routing_url, valid_tile

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1024
_lock = threading.Lock()
_next_request = 0.0


def wait_for_upstream():
    global _next_request
    with _lock:
        now = time.monotonic()
        delay = max(0, _next_request - now)
        if delay > 1:
            return False
        if delay:
            time.sleep(delay)
        _next_request = time.monotonic() + 0.26
        return True


@app.get('/health')
def health():
    return '', 204


@app.post('/route')
def route():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'origin', 'destination', 'key'}:
        return '', 400
    try:
        origin = point(*body['origin'])
        destination = point(*body['destination'])
        key = body['key']
        if not isinstance(key, str) or not 1 <= len(key) <= 128:
            return '', 400
        if not 5 <= meters(origin, destination) <= 5000:
            return '', 400
    except (TypeError, ValueError, OverflowError):
        return '', 400

    if not wait_for_upstream():
        return '', 429

    try:
        data = asyncio.run(_download(routing_url(origin, destination, key), trust_env=False))
    except Exception:
        # Upstream exceptions can include the credential and rider coordinates.
        return '', 502
    return Response(data, mimetype='application/json', headers={'Cache-Control': 'no-store'})


@app.post('/tile')
def tile():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) != {'z', 'x', 'y', 'key'}:
        return '', 400
    z, x, y, key = (body[field] for field in ('z', 'x', 'y', 'key'))
    if not valid_tile(z, x, y) or not isinstance(key, str) or not 1 <= len(key) <= 128:
        return '', 400
    if not wait_for_upstream():
        return '', 429

    url = f'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?' + urlencode({'apiKey': key})
    try:
        image = asyncio.run(_download(url, trust_env=False, max_bytes=TILE_MAX_BYTES))
    except Exception:
        # The upstream URL contains the server key.
        return '', 502
    if not image.startswith(PNG_SIGNATURE):
        return '', 502
    return Response(image, mimetype='image/png')
