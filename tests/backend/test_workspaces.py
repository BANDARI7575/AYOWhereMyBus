"""Feature APIs use isolated GTFS and community fixtures, never paid APIs."""
from tests.backend import test_release
from unittest.mock import patch
from datetime import datetime
from backend.transit_engine import TZ

class WorkspaceTests(test_release.ApiTests):
    def test_radius_pagination_and_directional_ids(self):
        with self.engine.connect(readonly=False) as c:
            c.executemany('INSERT INTO stops VALUES(?,?,?,?)',[(str(100+i),'Local stop '+str(i),'43.0001','-88') for i in range(70)])
        r=self.client.get('/api/explore/stops?lat=43&lon=-88&radius=.5').json
        self.assertEqual(len(r['stops']),50);self.assertEqual(r['total'],71)
        second=self.client.get('/api/explore/stops?lat=43&lon=-88&radius=.5&offset=50').json
        self.assertEqual(len(second['stops']),21);self.assertIsNone(second['next_offset'])
        self.assertFalse(set(s['stop_id'] for s in r['stops'])&set(s['stop_id'] for s in second['stops']))
        self.assertEqual(r['stops'][0]['stop_id'],'1')
    def test_manual_route_and_stop_data(self):
        self.assertEqual(len(self.client.get('/api/explore/stops?q=route%20R').json['stops']),3)
        self.assertEqual(self.client.get('/api/explore/stops?q=1').json['stops'][0]['stop_id'],'1')
        stop=self.client.get('/api/explore/stops/1').json
        self.assertEqual(stop['name'],'A');self.assertEqual(stop['scheduled_directions'][0]['headsign'],'B')
        self.assertEqual(self.client.get('/api/explore/stops/missing').status_code,400)
        self.assertEqual(self.client.get('/api/explore/routes?q=R').json['routes'][0]['route_id'],'R')
    def test_validation(self):
        for query in ['lat=nan&lon=1','lat=43','lat=43&lon=-88&radius=3','q=A','q=Stop&offset=-1']:
            self.assertEqual(self.client.get('/api/explore/stops?'+query).status_code,400)
        for name,args in [('arbitrary_url',{}),([],{}),('get_live_buses',{'url':'https://localhost/private'}),('find_nearby_stops',{'lat':True,'lon':0}),('find_nearby_stops',{'q':'AB','radius':True}),('find_nearby_stops',{'q':'AB','offset':float('inf')}),('find_nearby_stops',{'q':'AB','offset':1.5}),('get_live_buses',{'route':'http://evil'}),('open_feature',{'feature':'moderation'}),('plan_journey',{'from':'1','to':'3','walking':'yes'})]:
            self.assertEqual(self.client.post('/api/agent/tools',json={'name':name,'arguments':args}).status_code,400)
    def test_voice_blocked_without_auth_credentials_and_no_provider_request(self):
        with patch.dict('os.environ',{'OPENAI_API_KEY':'','AYO_REALTIME_ENABLED':'0'}),patch('requests.post') as provider:
            self.assertFalse(self.client.get('/api/agent/config').json['live_voice_available'])
            self.assertEqual(self.client.post('/api/agent/session',json={'sdp':'v=0'}).status_code,503)
            provider.assert_not_called()
    def test_agent_uses_official_tool_and_validated_navigation(self):
        r=self.client.post('/api/agent/tools',json={'name':'find_nearby_stops','arguments':{'q':'route R'}})
        self.assertEqual(r.status_code,200);self.assertEqual(r.json['source'],'MCTS GTFS')
        r=self.client.post('/api/agent/tools',json={'name':'open_feature','arguments':{'feature':'planner'}})
        self.assertEqual(r.json,{'feature':'planner'})
    def test_depart_at_rejects_naive_dates_and_unavailable_choices(self):
        for query in ['depart_at=2026-11-10T12:00','choice=-1','choice=3','choice=banana']:
            self.assertEqual(self.client.get('/api/journeys?from=1&to=3&'+query).status_code,400)
    def test_distinct_real_alternative_trips(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("INSERT INTO trips VALUES('V','R','S','C','0','X')")
            c.executemany('INSERT INTO stop_times VALUES(?,?,?,?,?)',[('V','1','1','24:11:00','24:11:00'),('V','3','2','24:36:00','24:36:00')])
        now=datetime(2026,11,10,tzinfo=TZ)
        a=self.engine.itinerary('1','3',now,allow_walks=False)
        b=self.engine.itinerary('1','3',now,allow_walks=False,choice=1)
        self.assertGreaterEqual(a['choices_available'],2)
        self.assertNotEqual([l['trip_id'] for l in a['legs']],[l['trip_id'] for l in b['legs']])

    def test_authenticated_voice_boundary_is_mocked_and_daily_capped(self):
        from backend.app import app
        from types import SimpleNamespace
        response=SimpleNamespace(status_code=201,content=b'v=0\r\n',text='v=0\r\n')
        with patch.dict('os.environ',{'OPENAI_API_KEY':'isolated-fake-test-key','AYO_REALTIME_ENABLED':'1','AYO_VOICE_SPEND_APPROVED':'1'}),patch.dict(app.config,{'AYO_VOICE_AUTHENTICATE':lambda request:'qa-account'}),patch('requests.post',return_value=response) as provider:
            for _ in range(3):
                result=self.client.post('/api/agent/session',json={'sdp':'v=0\r\n','language':'es'})
                self.assertEqual(result.status_code,200)
                self.assertNotIn('key',result.json)
            self.assertEqual(self.client.post('/api/agent/session',json={'sdp':'v=0'}).status_code,429)
            self.assertEqual(provider.call_count,3)
            import json
            settings=json.loads(provider.call_args.kwargs['files']['session'][1])
            self.assertTrue(settings['instructions'].startswith('Reply in Spanish.'))
            self.assertIn('0.621371',settings['instructions'])
            self.assertIn('3.28084',settings['instructions'])
            self.assertIn('Keep metric tool fields and tool arguments unchanged',settings['instructions'])
            self.assertEqual(settings['max_output_tokens'],256)
            self.assertEqual(next(t for t in settings['tools'] if t['name']=='get_stop_departures')['parameters']['required'],['stop_id'])
            self.assertEqual(next(t for t in settings['tools'] if t['name']=='open_feature')['parameters']['properties']['feature']['enum'],sorted(__import__('backend.feature_service',fromlist=['FEATURES']).FEATURES))

    def test_future_departure_is_explicit_and_cache_is_separate(self):
        import time
        from datetime import timedelta
        when=datetime.now(TZ)+timedelta(days=1)
        future={'legs':[],'status':'no_route','requested_at':int(when.timestamp()),'valid_until':None}
        with patch.object(self.engine,'itinerary',return_value=future) as itinerary:
            response=self.client.get('/api/journeys',query_string={'from':'1','to':'3','depart_at':when.isoformat()})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json['requested_departure_at'],int(when.timestamp()))
            self.assertLessEqual(abs(response.json['requested_at']-time.time()),2)
            self.assertEqual(itinerary.call_args.kwargs['now'],when)

    def test_voice_setup_failure_releases_admission_slot(self):
        from backend.app import app
        from types import SimpleNamespace
        import requests
        response=SimpleNamespace(status_code=201,content=b'v=0\r\n',text='v=0\r\n')
        with patch.dict('os.environ',{'OPENAI_API_KEY':'isolated-fake-test-key','AYO_REALTIME_ENABLED':'1','AYO_VOICE_SPEND_APPROVED':'1'}),patch.dict(app.config,{'AYO_VOICE_AUTHENTICATE':lambda request:'qa-account'}),patch('requests.post',side_effect=[requests.RequestException(),response]):
            self.assertEqual(self.client.post('/api/agent/session',json={'sdp':'v=0'}).status_code,503)
            self.assertEqual(self.client.post('/api/agent/session',json={'sdp':'v=0'}).status_code,200)
