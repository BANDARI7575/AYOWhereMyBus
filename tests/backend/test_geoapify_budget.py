import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
from flask import Flask, jsonify
from backend.services import geocoding_service, walking_service, geoapify_budget
from backend.services.transit_engine import ClosingConnection


def test_shared_budget_and_walking_contract():
    with tempfile.TemporaryDirectory() as td:
        dbpath = Path(td) / 'test.sqlite'
        def db():
            c = sqlite3.connect(dbpath, factory=ClosingConnection)
            c.row_factory = sqlite3.Row
            return c
        with db() as c:
            c.execute('CREATE TABLE stops(stop_id TEXT, stop_lat REAL, stop_lon REAL)')
            c.execute("INSERT INTO stops VALUES ('1',43.001,-88)")
        class Schedule:
            def connect(self): return db()
        app = Flask(__name__)
        @app.errorhandler(ValueError)
        def invalid(e): return jsonify(message=str(e)), 400
        geocoding_service.install_geocoding(app, db)
        walking_service.install_walking(app, Schedule(), db)
        walk = {'latitude':43.0,'longitude':-88.0,'stop_id':'1','consent':True}
        query = {'q':'Milwaukee City Hall','consent':True}
        route = {'features':[{'properties':{'distance':120,'time':100,'mode':'walk','distance_units':'meters'},'geometry':{'type':'MultiLineString','coordinates':[[[-88,43],[-88,43.001]]]}}]}
        with app.test_client() as client, patch.dict(os.environ, {'GEOAPIFY_API_KEY':'test-secret','AYO_WALKING_ENABLED':'1'}), patch.object(geoapify_budget,'DAILY_REQUEST_LIMIT',2), patch.object(walking_service,'fetch_feed',return_value=json.dumps(route).encode()) as w, patch.object(geocoding_service,'fetch_feed',return_value=b'{"results":[]}') as g:
            assert client.post('/api/walking-route',json={**walk,'consent':False}).status_code==400
            assert client.post('/api/walking-route',json={**walk,'latitude':999}).status_code==400
            assert client.post('/api/walking-route',json={**walk,'stop_id':'missing'}).status_code==400
            at_stop = client.post('/api/walking-route', json={**walk, 'latitude':43.001})
            assert at_stop.status_code == 400
            assert at_stop.json['code'] == 'walking_distance_out_of_range'
            assert client.post('/api/location-search',json={**query,'consent':False}).status_code==400
            w.assert_not_called(); g.assert_not_called()
            assert client.post('/api/location-search',json=query).status_code==200
            r=client.post('/api/walking-route',json=walk)
            assert r.status_code==200 and r.json['points']==[[43,-88],[43.001,-88]]
            assert r.json['duration_seconds']==100 and r.json['stop_id']=='1'
            assert 'test-secret' not in r.get_data(as_text=True)
            assert client.post('/api/location-search',json=query).status_code==429
            assert client.post('/api/walking-route',json=walk).status_code==429
            w.assert_called_once(); g.assert_called_once()
            with db() as c:
                assert c.execute('SELECT count FROM geoapify_budget').fetchone()[0]==2
                c.execute('DELETE FROM geoapify_budget'); c.execute('DELETE FROM walking_budget')
            w.return_value=b'{}'
            r=client.post('/api/walking-route',json=walk)
            assert r.status_code==502 and 'test-secret' not in r.get_data(as_text=True)
            with db() as c:
                assert c.execute('SELECT count FROM geoapify_budget').fetchone()[0]==1

        key_file = Path(td) / 'geoapify-routing.key'
        with app.test_client() as client, patch.dict(os.environ, {
            'GEOAPIFY_API_KEY': '', 'AYO_WALKING_ENABLED': '1',
            'AYO_WALKING_RELAY': '1', 'AYO_WALKING_KEY_FILE': str(key_file),
        }), patch.object(walking_service, '_download', return_value=json.dumps(route).encode()) as relay:
            assert client.post('/api/walking-route', json=walk).status_code == 503
            relay.assert_not_called()
            key_file.write_text('dedicated-test-key\n')
            assert client.post('/api/walking-route', json={**walk, 'consent': False}).status_code == 400
            relay.assert_not_called()
            response = client.post('/api/walking-route', json=walk)
            assert response.status_code == 200
            assert response.json['basemap'] == 'geoapify'
            assert response.json['distance_meters'] == 120
            assert response.json['duration_seconds'] == 100
            assert 'dedicated-test-key' not in response.get_data(as_text=True)
            relay.assert_awaited_once_with('http://geoapify:8082/route', trust_env=False, payload={
                'origin': (43.0, -88.0), 'destination': (43.001, -88.0), 'key': 'dedicated-test-key',
            })


def test_legacy_walking_budget_migrates_and_utc_rollover():
    with sqlite3.connect(':memory:') as c, patch.object(geoapify_budget,'DAILY_REQUEST_LIMIT',2):
        c.execute('CREATE TABLE walking_budget(day INTEGER PRIMARY KEY,count INTEGER NOT NULL)')
        c.execute('INSERT INTO walking_budget VALUES (100,2)')
        assert not geoapify_budget.reserve(c,day=100)
        assert geoapify_budget.reserve(c,day=101)
        assert c.execute('SELECT day,count FROM geoapify_budget').fetchall()==[(101,1)]


def test_private_routing_relay_limits_upstream_requests():
    from urllib.parse import parse_qs, urlsplit
    from backend.services import walking_relay

    payload = {'origin': [43, -88], 'destination': [43.001, -88], 'key': 'test-key'}
    with walking_relay.app.test_client() as client, \
            patch.object(walking_relay, '_next_request', 0), \
            patch.object(walking_relay, '_download', return_value=b'{"features":[]}') as upstream:
        assert client.get('/health').status_code == 204
        assert client.get('/route').status_code == 405
        assert client.post('/route', json={**payload, 'url': 'https://example.com'}).status_code == 400
        assert client.post('/route', json={**payload, 'destination': [44, -88]}).status_code == 400
        upstream.assert_not_called()
        result = client.post('/route', json=payload)
        assert result.status_code == 200
        assert result.headers['Cache-Control'] == 'no-store'
        with patch.object(walking_relay, '_next_request', time.monotonic() + 2):
            assert client.post('/route', json=payload).status_code == 429
        upstream.assert_called_once()
        url = urlsplit(upstream.call_args.args[0])
        assert (url.scheme, url.netloc, url.path) == ('https', 'api.geoapify.com', '/v1/routing')
        assert parse_qs(url.query) == {
            'waypoints': ['43,-88|43.001,-88'], 'mode': ['walk'], 'units': ['metric'],
            'format': ['geojson'], 'apiKey': ['test-key'],
        }
        assert upstream.call_args.kwargs == {'trust_env': False}


def test_walking_tiles_validate_input_and_use_separate_daily_budget():
    from urllib.parse import parse_qs, urlsplit
    from backend.services import walking_relay

    image = walking_service.PNG_SIGNATURE + b'test'
    args = {'z': 17, 'x': 33530, 'y': 48000, 'key': 'test-key'}
    with walking_relay.app.test_client() as client, \
            patch.object(walking_relay, '_next_request', 0), \
            patch.object(walking_relay, '_download', return_value=image) as upstream:
        assert client.post('/tile', json={**args, 'z': 22}).status_code == 400
        assert client.post('/tile', json={**args, 'host': 'example.com'}).status_code == 400
        upstream.assert_not_called()
        response = client.post('/tile', json=args)
        assert response.status_code == 200 and response.data == image
        url = urlsplit(upstream.call_args.args[0])
        assert (url.scheme, url.netloc, url.path) == (
            'https', 'maps.geoapify.com', '/v1/tile/osm-carto/17/33530/48000.png')
        assert parse_qs(url.query) == {'apiKey': ['test-key']}

    with tempfile.TemporaryDirectory() as td:
        def db():
            return sqlite3.connect(Path(td) / 'budget.sqlite', factory=ClosingConnection)

        app = Flask(__name__)
        walking_service.install_walking(app, None, db)
        with app.test_client() as client, patch.dict(os.environ, {
            'AYO_WALKING_ENABLED': '1', 'AYO_WALKING_RELAY': '1',
            'AYO_WALKING_KEY_FILE': '', 'GEOAPIFY_API_KEY': 'test-key',
        }), patch.object(walking_service, 'TILE_DAILY_LIMIT', 1), \
                patch.object(walking_service, '_download', return_value=image) as relay:
            url = '/api/walking-map-tile?z=17&x=33530&y=48000'
            assert client.get(url + '&x=1').status_code == 400
            assert client.get(url.replace('48000', '900000')).status_code == 400
            assert client.head(url).status_code == 405
            relay.assert_not_called()
            response = client.get(url)
            assert response.status_code == 200 and response.data == image
            assert response.headers['Cache-Control'] == 'private, max-age=3600'
            assert client.get(url).status_code == 429
            relay.assert_awaited_once_with(walking_service.TILE_RELAY_URL, trust_env=False,
                                           payload=args, max_bytes=walking_service.TILE_MAX_BYTES, read_timeout=9)
