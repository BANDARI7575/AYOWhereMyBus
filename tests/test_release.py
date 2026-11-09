import csv
import os
import tempfile
import unittest
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
from google.transit import gtfs_realtime_pb2 as pb
from transit_engine import Schedule, TZ, seconds
from realtime_service import Realtime

class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); root=Path(self.tmp.name)
        tables={
        'stops':[['stop_id','stop_name','stop_lat','stop_lon'],['1','A','43','-88'],['2','B','43.01','-88'],['3','C','43.02','-88']],
        'routes':[['route_id','route_short_name','route_long_name'],['R','R','Route']],
        'trips':[['trip_id','route_id','service_id','trip_headsign','direction_id','shape_id'],['T','R','S','B','0','X'],['U','R','S','C','0','X']],
        'calendar_dates':[['service_id','date','exception_type'],['S','20261109','1'],['S','20261110','2']],
        'stop_times':[['trip_id','stop_id','stop_sequence','arrival_time','departure_time'],['T','1','1','24:10:00','24:10:00'],['T','2','2','24:20:00','24:20:00'],['U','2','1','24:25:00','24:25:00'],['U','3','2','24:35:00','24:35:00']],
        'shapes':[['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'],['X','43','-88','1']]}
        for name,rows in tables.items():
            with (root/(name+'.txt')).open('w') as f: csv.writer(f).writerows(rows)
        self.engine=Schedule(root,root/'index.sqlite');self.engine.build()
    def tearDown(self): self.tmp.cleanup()
    def test_extended_service_day_and_exclusion(self):
        d=self.engine.departures('1',datetime(2026,11,10,0,0,tzinfo=TZ))
        self.assertEqual(len(d),1);self.assertEqual(d[0]['service_date'],'20261109');self.assertIsNone(d[0]['prediction_at'])
        self.assertEqual(self.engine.departures('1',datetime(2026,11,11,0,0,tzinfo=TZ)),[])
    def test_transfer_journey(self):
        d=self.engine.plan('1','3',datetime(2026,11,10,0,0,tzinfo=TZ))
        self.assertEqual([x['route'] for x in d['legs']],['R','R'])
    def test_invalid_stop(self):
        with self.assertRaises(ValueError): self.engine.plan('bad','3')
    def test_shapes_and_time(self):
        self.assertEqual(self.engine.shape('R'),[[[43.0,-88.0]]]);self.assertEqual(seconds('25:00:00'),90000)
        with self.assertRaises(ValueError): seconds('12:61:00')

class RealtimeTests(unittest.TestCase):
    def test_exact_fresh_prediction_and_cancellation(self):
        import time
        rt=Realtime();f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=int(time.time())
        u=f.entity.add(id='1').trip_update;u.trip.trip_id='T';u.trip.start_date='20261109';u.timestamp=int(time.time())
        s=u.stop_time_update.add(stop_id='1');s.departure.time=int(time.time())+120
        d={'trip_id':'T','service_date':'20261109','stop_id':'1','stop_sequence':'1','prediction_at':None}
        with patch.object(rt,'feed',return_value=(f,'fresh')):
            out,status=rt.apply([d]); self.assertEqual(out[0]['prediction_at'],s.departure.time)
            u.trip.schedule_relationship=pb.TripDescriptor.CANCELED
            self.assertTrue(rt.apply([d])[0][0]['canceled'])
        with patch.object(rt,'feed',return_value=(f,'stale_or_invalid')):self.assertIsNone(rt.apply([d])[0][0]['prediction_at'])
    def test_mismatched_service_day_never_predicts(self):
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';u=f.entity.add(id='1').trip_update;u.trip.trip_id='T';u.trip.start_date='20261108'
        d={'trip_id':'T','service_date':'20261109','prediction_at':None}
        rt=Realtime()
        with patch.object(rt,'feed',return_value=(f,'fresh')): self.assertIsNone(rt.apply([d])[0][0]['prediction_at'])

class ApiTests(ScheduleTests):
    def setUp(self):
        super().setUp()
        import release_api
        self.patches=[patch.object(release_api,'schedule',self.engine),patch.object(release_api,'DB',str(Path(self.tmp.name)/'community.sqlite'))]
        for p in self.patches:p.start()
        from app import app
        self.client=app.test_client()
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        super().tearDown()
    def test_validation_and_moderation(self):
        self.assertEqual(self.client.get('/api/stops/nearby?lat=nan&lon=0').status_code,400)
        self.assertEqual(self.client.post('/api/winter/reports',json={'stop_id':'1','text':'<script>alert(1)</script>'}).status_code,400)
        r=self.client.post('/api/winter/reports',json={'stop_id':'1','text':'Ice covering the boarding area.'});self.assertEqual(r.status_code,202);rid=r.json['id']
        self.assertEqual(self.client.get('/api/winter/reports').json['reports'],[])
        self.assertEqual(self.client.post(f'/api/moderation/reports/{rid}',json={'state':'approved'}).status_code,401)
        with patch.dict(os.environ,{'MODERATOR_TOKEN':'test-secret'}):
            self.assertEqual(self.client.post(f'/api/moderation/reports/{rid}',json={'state':'approved'},headers={'Authorization':'Bearer test-secret'}).status_code,200)
        self.assertEqual(len(self.client.get('/api/winter/reports').json['reports']),1)
        self.assertEqual(self.client.post(f'/api/winter/reports/{rid}/vote',json={'value':1}).status_code,200)
        self.assertEqual(self.client.post(f'/api/winter/reports/{rid}/vote',json={'value':1}).status_code,200)
        self.assertEqual(self.client.get('/api/winter/reports').json['reports'][0]['votes'],1)
    def test_rate_limit_and_origin(self):
        self.assertEqual(self.client.post('/api/winter/reports',json={},headers={'Origin':'https://evil.example'}).status_code,403)
        # Freeze the fixed-window clock so a real minute rollover cannot reset the budget mid-test.
        with patch('release_api.time.time',return_value=2000000000):
            for _ in range(121):r=self.client.get('/api/stops/search?q=AA')
            self.assertEqual(r.status_code,429)
    def test_shell(self):
        with self.client.get('/') as response: self.assertEqual(response.status_code,200)
        with self.client.get('/sw.js') as response: self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/api/status').headers['Cache-Control'],'no-store')


class AdditionalTests(unittest.TestCase):
    def test_dst_service_anchor(self):
        from transit_engine import service_epoch
        from datetime import date
        at=datetime.fromtimestamp(service_epoch(date(2026,11,1),'03:00:00'),TZ)
        self.assertEqual(at.hour,3)
    def test_vehicle_parser_rejects_invalid_and_preserves_missing_time(self):
        from app import parse_vehicle_feed
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0'
        v=f.entity.add(id='1').vehicle;v.trip.route_id='1';v.position.latitude=float('nan');v.position.longitude=-88
        self.assertEqual(parse_vehicle_feed(f.SerializeToString())['buses'],[])
        v.position.latitude=43
        self.assertIsNone(parse_vehicle_feed(f.SerializeToString())['buses'][0]['reported_at'])
    def test_feed_failure_is_explicit(self):
        import requests
        rt=Realtime()
        with patch('realtime_service.fetch_feed',side_effect=TimeoutError):
            self.assertEqual(rt.alerts()['status'],'unavailable');self.assertEqual(rt.alerts()['alerts'],[])
    def test_mcts_missing_date_absolute_arrival(self):
        import time
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';u=f.entity.add(id='1').trip_update;u.trip.trip_id='T';u.timestamp=int(time.time())
        stop=u.stop_time_update.add(stop_id='1');stop.arrival.time=int(time.time())+60
        d={'trip_id':'T','service_date':'20261109','stop_id':'1','stop_sequence':'1','scheduled_epoch':int(time.time())+120,'prediction_at':None}
        rt=Realtime()
        with patch.object(rt,'feed',return_value=(f,'fresh')):
            out=rt.apply([d])[0][0];self.assertEqual(out['prediction_at'],stop.arrival.time);self.assertEqual(out['prediction_kind'],'arrival')
            d['scheduled_epoch']-=86400;self.assertIsNone(rt.apply([d])[0][0]['prediction_at'])

if __name__=='__main__': unittest.main()
