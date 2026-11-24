"""Optional server-side Geoapify lookup. No keys, queries or results are persisted."""
import json
import math
import os
import threading
from urllib.parse import urlencode
from backend.services.feed_http import fetch_feed
from backend.services.geoapify_budget import reserve
from flask import jsonify, request

_slots = threading.BoundedSemaphore(2)


def install_geocoding(app, db):
    @app.get('/api/location-config')
    def location_config():
        return jsonify(configured=bool(os.getenv('GEOAPIFY_API_KEY')), provider='Geoapify')

    @app.post('/api/location-search')
    def location_search():
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or body.get('consent') is not True:
            return jsonify(message='Explicit location-sharing consent is required.'), 400
        query = body.get('q', '')
        if not isinstance(query, str):
            raise ValueError('Enter a location query')
        query = query.strip()
        if not 2 <= len(query) <= 120:
            raise ValueError('Enter 2–120 characters')
        token = os.getenv('GEOAPIFY_API_KEY', '')
        if not token:
            return jsonify(message='Address search is not configured. Search official MCTS stops instead.'), 503
        if not _slots.acquire(blocking=False):
            return jsonify(message='Location search is busy. Please retry.'), 429
        try:
            with db() as c:
                if not reserve(c):
                    return jsonify(message="Daily Geoapify request limit reached."), 429
            params = dict(text=query, bias='proximity:-87.9065,43.0389', filter='countrycode:us',
                          format='json', limit=6, lang='es' if body.get('lang') == 'es' else 'en', apiKey=token)
            payload = fetch_feed('https://api.geoapify.com/v1/geocode/search?' + urlencode(params))
            if len(payload) > 300000:
                raise ValueError('Geocoder response too large')
            raw = json.loads(payload)
            if not isinstance(raw.get('results'), list):
                raise ValueError('Invalid geocoder response')
            rows, seen = [], set()
            for item in raw['results'][:6]:
                lat, lon = item.get('lat'), item.get('lon')
                if not all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v) for v in (lat, lon)):
                    continue
                if abs(lat) > 90 or abs(lon) > 180 or not item.get('formatted'):
                    continue
                key = (round(lat, 6), round(lon, 6), item['formatted'])
                if key in seen:
                    continue
                seen.add(key)
                rows.append(dict(kind='place', name=str(item['formatted'])[:500], latitude=lat,
                                 longitude=lon, source='Geoapify', timezone=(item.get('timezone') or {}).get('name')))
            result = jsonify(locations=rows, attribution='Powered by Geoapify · © OpenStreetMap contributors')
            result.headers['Cache-Control'] = 'no-store'
            return result
        except Exception:
            # Do not log exceptions containing the credential-bearing upstream URL.
            return jsonify(message='Address search is temporarily unavailable. Official stop search remains available.'), 502
        finally:
            _slots.release()
