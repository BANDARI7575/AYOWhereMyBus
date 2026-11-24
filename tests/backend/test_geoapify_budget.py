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


def test_legacy_walking_budget_migrates_and_utc_rollover():
    with sqlite3.connect(':memory:') as c, patch.object(geoapify_budget,'DAILY_REQUEST_LIMIT',2):
        c.execute('CREATE TABLE walking_budget(day INTEGER PRIMARY KEY,count INTEGER NOT NULL)')
        c.execute('INSERT INTO walking_budget VALUES (100,2)')
        assert not geoapify_budget.reserve(c,day=100)
        assert geoapify_budget.reserve(c,day=101)
        assert c.execute('SELECT day,count FROM geoapify_budget').fetchall()==[(101,1)]
