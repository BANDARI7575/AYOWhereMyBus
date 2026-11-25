"""Private, bounded gateway for the three public MCTS GTFS-Realtime feeds."""
import asyncio
import threading
import time

from flask import Flask, Response, request

from backend.services.feed_http import MCTS_FEEDS, _download

app = Flask(__name__)
_locks = {name: threading.Lock() for name in MCTS_FEEDS}
_cache = {}


@app.get('/health')
def health():
    return '', 204


@app.get('/feeds/<name>')
def feed(name):
    if name not in MCTS_FEEDS or request.query_string:
        return '', 404
    if request.method != 'GET':
        return '', 405
    with _locks[name]:
        expires, payload = _cache.get(name, (0, None))
        if time.monotonic() >= expires:
            try:
                payload = asyncio.run(_download(MCTS_FEEDS[name], trust_env=False))
            except Exception:
                payload = None
            _cache[name] = (time.monotonic() + (15 if payload else 8), payload)
    if not payload:
        return '', 502
    return Response(payload, mimetype='application/x-protobuf', headers={'Cache-Control': 'no-store'})
