"""Launch-critical regressions. All rider reports and times are isolated fixtures."""
import json
import time
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
from google.transit import gtfs_realtime_pb2 as pb
import test_journey
import test_release
import release_api
from realtime_service import Realtime
from transit_engine import TZ, MIN_TRANSFER_SECONDS

NOW=test_journey.NOW

class ReliabilityTests(test_release.ScheduleTests):
    def test_minimum_and_tight_transfer_margin(self):
        result=self.engine.itinerary('1','3',NOW)
        self.assertEqual(result['minimum_transfer_seconds'],180)
        self.assertEqual(result['valid_until'],int(NOW.timestamp())+300)
        with self.engine.connect(readonly=False) as c:
            c.execute("UPDATE stop_times SET departure_time='24:22:00' WHERE trip_id='U' AND stop_sequence='1'")
        self.assertEqual(self.engine.itinerary('1','3',NOW)['status'],'no_route')
    def test_forbidden_and_minimum_gtfs_transfer_rules(self):
        with self.engine.connect(readonly=False) as c: c.execute("INSERT INTO transfers VALUES('2','2','3','')")
        self.assertEqual(self.engine.itinerary('1','3',NOW)['status'],'no_route')
        with self.engine.connect(readonly=False) as c: c.execute("UPDATE transfers SET transfer_type='2',min_transfer_time='600'")
        self.assertEqual(self.engine.itinerary('1','3',NOW)['status'],'no_route')
    def test_conditional_pickup_and_frequency_trips_not_presented_as_scheduled(self):
        with self.engine.connect(readonly=False) as c: c.execute("INSERT INTO frequencies VALUES('T')")
        self.assertEqual(self.engine.departures('1',NOW),[])
    def test_atomic_failure_preserves_previous_index(self):
        (self.engine.source/'trips.txt').write_text('invalid field\nvalue\n')
        with self.assertRaises(ValueError): self.engine.build()
        self.assertEqual(len(self.engine.departures('1',NOW)),1)
    def test_readonly_request_connection(self):
        import sqlite3
        with self.engine.connect() as c:
            with self.assertRaises(sqlite3.OperationalError): c.execute('DELETE FROM stops')
    def test_calendar_weekday_and_exception_removal(self):
        (self.engine.source/'calendar.txt').write_text('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,0,0,20261101,20261130\n')
        self.engine.build()
        self.assertIn('S',self.engine.services(datetime(2026,11,11).date()))
        self.assertNotIn('S',self.engine.services(datetime(2026,11,10).date()))

class ModerationTests(test_release.ApiTests):
    def test_expired_unapproved_private_and_no_voting(self):
        with release_api.db() as c:
            c.execute("INSERT INTO reports(id,stop_id,text,state,created,expires) VALUES(101,'1','Approved but expired','approved',?,?)",(int(time.time())-100,int(time.time())-1))
            c.execute("INSERT INTO reports(id,stop_id,text,state,created,expires) VALUES(102,'1','Pending content stays private','pending',?,?)",(int(time.time()),int(time.time())+500))
        self.assertEqual(self.client.get('/api/winter/reports').json['reports'],[])
        for rid in [101,102]:self.assertEqual(self.client.post(f'/api/winter/reports/{rid}/vote',json={'value':1}).status_code,404)
        with patch.dict('os.environ',{'MODERATOR_TOKEN':'test'}):
            self.assertEqual(self.client.post('/api/moderation/reports/101',json={'state':'approved'},headers={'Authorization':'Bearer test'}).json['updated'],0)
    def test_unicode_auth_fails_closed_and_audit_records_approval(self):
        with patch.dict('os.environ',{'MODERATOR_TOKEN':'test'}):
            self.assertEqual(self.client.get('/api/moderation/reports',headers={'Authorization':'Bearer café'}).status_code,401)
            r=self.client.post('/api/winter/reports',json={'stop_id':'1','text':'Ice at the boarding area.'})
            rid=r.json['id']
            self.client.post(f'/api/moderation/reports/{rid}',json={'state':'approved'},headers={'Authorization':'Bearer test'})
        with release_api.db() as c:self.assertEqual(c.execute('SELECT state FROM moderation_audit WHERE report_id=?',(rid,)).fetchone()[0],'approved')
    def test_hourly_report_limit_survives_intervening_reads(self):
        for i in range(4):
            r=self.client.post('/api/winter/reports',json={'stop_id':'1','text':f'Ice at the boarding area observation {i}.'})
            self.client.get('/api/winter/reports')
            self.assertEqual(r.status_code,202 if i<3 else 429)
    def test_health_is_liveness_when_storage_missing(self):
        with patch.object(release_api,'DB','/nonexistent/unwritable/community.sqlite'):
            self.assertEqual(self.client.get('/api/health').status_code,200)
    def test_busy_planner_fails_fast(self):
        self.assertTrue(release_api._journey_slots.acquire(False));self.assertTrue(release_api._journey_slots.acquire(False))
        try:self.assertEqual(self.client.get('/api/journeys?from=1&to=3').status_code,503)
        finally:release_api._journey_slots.release();release_api._journey_slots.release()
    def test_security_headers_and_json_validation(self):
        r=self.client.get('/api/health',base_url='https://localhost')
        self.assertIn('Strict-Transport-Security',r.headers)
        self.assertIn("object-src 'none'",r.headers['Content-Security-Policy'])
        self.assertEqual(self.client.post('/api/winter/reports',json=[]).status_code,400)

class FeedTests(test_release.RealtimeTests):
    def fixture(self):
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=int(time.time())
        u=f.entity.add(id='1').trip_update;u.trip.trip_id='T';u.trip.start_date='20261109';u.trip.route_id='R';u.timestamp=int(time.time())
        s=u.stop_time_update.add(stop_id='1',stop_sequence=1);s.arrival.time=int(time.time())+120
        d={'trip_id':'T','route_id':'R','service_date':'20261109','stop_id':'1','stop_sequence':'1','scheduled_epoch':int(time.time())+60,'prediction_at':None}
        return f,u,s,d
    def test_wrong_route_sequence_and_absurd_event_are_rejected(self):
        for kind in ['route','sequence','time']:
            f,u,s,d=self.fixture()
            if kind=='route':u.trip.route_id='OTHER'
            if kind=='sequence':s.stop_sequence=10
            if kind=='time':s.arrival.time+=86400
            rt=Realtime()
            with patch.object(rt,'feed',return_value=(f,'fresh')):self.assertIsNone(rt.apply([d])[0][0]['prediction_at'])
    def test_differential_vehicle_feed_is_rejected(self):
        from app import parse_vehicle_feed
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.incrementality=1
        with self.assertRaises(ValueError):parse_vehicle_feed(f.SerializeToString())
    def test_inactive_service_alert_is_not_shown(self):
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0'
        a=f.entity.add(id='expired').alert;a.header_text.translation.add(text='Old disruption')
        a.active_period.add(start=int(time.time())-100,end=int(time.time())-1)
        rt=Realtime()
        with patch.object(rt,'feed',return_value=(f,'fresh')):self.assertEqual(rt.alerts()['alerts'],[])

    def test_stale_feed_never_labels_a_fresh_gps_as_reliable(self):
        import app as backend
        import tempfile
        with tempfile.TemporaryDirectory() as folder, patch.object(release_api,'DB',folder+'/community.sqlite'):
            payload={'feed_timestamp':int(time.time())-1000,'buses':[{'bus_id':'test','route':'1','reported_at':int(time.time()),'latitude':43,'longitude':-88}]}
            with patch.object(backend,'live_vehicles',return_value=payload):
                response=backend.app.test_client().get('/api/buses?route=1')
                self.assertFalse(response.json['feed_fresh'])
                self.assertEqual(response.json['buses'][0]['reliability'],'stale_or_unknown')
