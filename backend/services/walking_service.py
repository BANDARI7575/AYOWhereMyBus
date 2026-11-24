"""Opt-in pedestrian routes to official stops; no coordinates persisted."""
import json
import math
import os
import threading
import time
from urllib.parse import urlencode
from flask import jsonify, request
from backend.services.feed_http import fetch_feed
from backend.services.geoapify_budget import reserve

_slots = threading.BoundedSemaphore(2)
DAILY_REQUEST_LIMIT = 500


def point(lat, lon):
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (lat, lon)) or abs(lat)>90 or abs(lon)>180:
        raise ValueError('Invalid coordinates')
    return lat, lon


def meters(a, b):
    lat1, lat2 = map(math.radians, (a[0], b[0]))
    dlon = math.radians(b[1]-a[1])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 12742000*math.asin(math.sqrt(min(1, max(0, h))))


def parse_route(raw, origin, destination):
    feature = raw['features'][0]
    props, geometry = feature['properties'], feature['geometry']
    distance, duration = props['distance'], props['time']
    if props.get('mode') != 'walk' or props.get('distance_units') != 'meters' or not all(type(v) in (int,float) and math.isfinite(v) and v>0 for v in (distance,duration)) or distance>20000 or duration>28800:
        raise ValueError('Invalid pedestrian route')
    if geometry.get('type') != 'MultiLineString':
        raise ValueError('Invalid geometry')
    lines = geometry['coordinates']
    if len(lines)!=1 or not 2<=len(lines[0])<=20000:
        raise ValueError('Invalid route shape')
    points = [point(p[1],p[0]) for p in lines[0]]
    if meters(points[0],origin)>100 or meters(points[-1],destination)>100:
        raise ValueError('Route endpoints too far from selected points')
    return dict(mode='walking', source='Geoapify', distance_meters=distance, duration_seconds=duration, points=points, retrieved_at=int(time.time()), attribution='Powered by Geoapify · © OpenStreetMap contributors')


def install_walking(app, schedule, db):
    @app.post('/api/walking-route')
    def walking_route():
        body = request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)!={'latitude','longitude','stop_id','consent'} or body['consent'] is not True:
            return jsonify(message='Explicit location-sharing consent is required.'),400
        origin = point(body['latitude'],body['longitude'])
        stop = body['stop_id']
        if not isinstance(stop,str) or not 1<=len(stop)<=128:
            raise ValueError('Choose a valid stop')
        token = os.getenv('GEOAPIFY_API_KEY','')
        if not token or os.getenv('AYO_WALKING_ENABLED')!='1':
            return jsonify(message='In-app walking directions are not configured.'),503
        with schedule.connect() as c:
            row = c.execute('SELECT * FROM stops WHERE stop_id=?',(stop,)).fetchone()
        if not row:
            raise ValueError('Choose a valid stop')
        row = dict(row)
        if row.get('location_type') not in ('','0',0,None):
            raise ValueError('Choose a boarding stop')
        try:
            destination = point(float(row.get('stop_lat',row.get('latitude'))),float(row.get('stop_lon',row.get('longitude'))))
        except (ValueError,TypeError):
            return jsonify(message='Stop coordinates unavailable.'),503
        if not 5<=meters(origin,destination)<=5000:
            return jsonify(message='Walking route requires a stop between 5 m and 5 km away.'),400
        if not _slots.acquire(blocking=False):
            return jsonify(message='Walking service is busy.'),429
        try:
            day = int(time.time()//86400)
            with db() as c:
                c.execute('CREATE TABLE IF NOT EXISTS walking_budget(day INTEGER PRIMARY KEY, count INTEGER NOT NULL)')
                c.execute('DELETE FROM walking_budget WHERE day<?',(day,))
                c.execute('INSERT INTO walking_budget VALUES(?,0) ON CONFLICT(day) DO NOTHING',(day,))
                count = c.execute('SELECT count FROM walking_budget WHERE day=?',(day,)).fetchone()[0]
                if count >= DAILY_REQUEST_LIMIT:
                    return jsonify(message='Daily walking request limit reached.'),429
                if not reserve(c, day=day, legacy_walking=count):
                    return jsonify(message='Daily Geoapify request limit reached.'),429
                c.execute('UPDATE walking_budget SET count=count+1 WHERE day=?',(day,))
            params = dict(waypoints=f'{origin[0]},{origin[1]}|{destination[0]},{destination[1]}',mode='walk',units='metric',format='geojson',apiKey=token)
            raw = json.loads(fetch_feed('https://api.geoapify.com/v1/routing?'+urlencode(params)))
            result = parse_route(raw,origin,destination)
            return jsonify(**result,stop_id=stop)
        except Exception:
            # Never expose or log the provider URL, key or coordinates.
            return jsonify(message='Walking route unavailable. Use external directions.'),502
        finally:
            _slots.release()
