"""Focused regression evidence for same-minute GTFS and shared alert filters."""
from datetime import datetime, date
from types import SimpleNamespace
import unittest
from tests.backend import test_release
from backend.transit_engine import TZ, service_epoch
from backend.alert_service import snapshot, filter_route

class TransitCompletionTests(unittest.TestCase):
    def setUp(self):
        test_release.ScheduleTests.setUp(self)
    def tearDown(self):
        test_release.ScheduleTests.tearDown(self)
    def test_same_minute_source_times_remain_honest(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("UPDATE stop_times SET arrival_time='24:10:00',departure_time='24:10:00' WHERE trip_id='T' AND stop_id='2'")
        result=self.engine.itinerary('1','2',datetime(2026,11,10,0,0,tzinfo=TZ),allow_walks=False)
        self.assertEqual(result['duration_seconds'],0)
        self.assertEqual(result['legs'][0]['duration_precision'],'same_published_minute')
        self.assertEqual(result['legs'][0]['from_sequence'],1)
        self.assertEqual(result['legs'][0]['to_sequence'],2)
    def test_extended_hour_rollover_retains_seconds(self):
        day=date(2026,11,9)
        self.assertEqual(service_epoch(day,'24:00:15')-service_epoch(day,'23:59:30'),45)
    def test_stop_alert_route_membership_matches_filter(self):
        raw={'status':'fresh','alerts':[{'id':'stop','affected':[{'stop_id':'1'}]},{'id':'system','affected':[]},{'id':'other','affected':[{'route_id':'OTHER'}]}]}
        data=snapshot(SimpleNamespace(alerts=lambda:raw),self.engine)
        self.assertEqual([a['id'] for a in filter_route(data,'R')['alerts']],['stop','system'])
        self.assertEqual([a['id'] for a in filter_route(data,'UNKNOWN')['alerts']],['system'])
        self.assertNotIn('relevant_routes',raw['alerts'][0])
    def test_successful_empty_and_unavailable_are_distinct(self):
        for status in ['fresh','unavailable']:
            data=snapshot(SimpleNamespace(alerts=lambda:{'status':status,'alerts':[]}),self.engine)
            self.assertEqual(data['status'],status)
