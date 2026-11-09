"""Routing quality regressions; fixtures remain isolated from rider data."""
import unittest
from datetime import datetime
import test_release
from transit_engine import Schedule,TZ

NOW=datetime(2026,11,10,0,0,tzinfo=TZ)

class RoutingQualityTests(test_release.ScheduleTests):
    def test_short_reverse_direction_detour_rejected_and_walking_opt_in(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("UPDATE stops SET stop_lat='43.0001',stop_lon='-88.003' WHERE stop_id='3'")
            c.execute("UPDATE trips SET direction_id='1' WHERE trip_id='U'")
        result=self.engine.itinerary('1','3',NOW,allow_walks=False)
        self.assertEqual(result['status'],'no_route')
        self.assertEqual(result['search_outcome'],'unreasonable_detour_excluded')
        self.assertTrue(result['nearby_trip'])
        walking=self.engine.itinerary('1','3',NOW,allow_walks=True)
        self.assertEqual([l['type'] for l in walking['legs']],['walk'])
        self.assertEqual(walking['legs'][0]['geometry'],[])
        self.assertTrue(walking['legs'][0]['estimated'])
        self.assertEqual(walking['data_type'],'estimated_walk')
        self.assertGreater(walking['valid_until'],walking['requested_at'])
    def test_same_route_reversal_that_retraces_boarding_area_is_excluded(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("INSERT INTO stops VALUES('5','Opposite platform near origin','43.0001','-88')")
            c.execute("UPDATE trips SET direction_id='1' WHERE trip_id='U'")
            c.execute("UPDATE stop_times SET stop_sequence='3' WHERE trip_id='U' AND stop_id='3'")
            c.execute("INSERT INTO stop_times VALUES('U','5','2','24:30:00','24:30:00')")
        self.assertEqual(self.engine.itinerary('1','3',NOW,allow_walks=False)['status'],'no_route')

    def test_direct_service_beats_one_minute_faster_transfer(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("INSERT INTO trips VALUES('V','R','S','C','0','X')")
            c.executemany('INSERT INTO stop_times VALUES(?,?,?,?,?)',[('V','1','1','24:11:00','24:11:00'),('V','3','2','24:36:00','24:36:00')])
        result=self.engine.itinerary('1','3',NOW,allow_walks=False)
        self.assertEqual([l['trip_id'] for l in result['legs']],['V'])
    def test_later_incoming_trip_survives_trip_specific_transfer_restriction(self):
        with self.engine.connect(readonly=False) as c:
            c.execute('ALTER TABLE transfers ADD COLUMN from_trip_id TEXT')
            c.execute('ALTER TABLE transfers ADD COLUMN to_trip_id TEXT')
            c.execute("INSERT INTO transfers VALUES('2','2','3','','T','U')")
            c.execute("INSERT INTO trips VALUES('V','R','S','B','0','X')")
            c.executemany('INSERT INTO stop_times VALUES(?,?,?,?,?)',[('V','1','1','24:11:00','24:11:00'),('V','2','2','24:21:00','24:21:00')])
        result=self.engine.itinerary('1','3',NOW,allow_walks=False)
        self.assertEqual([l['trip_id'] for l in result['legs']],['V','U'])
        self.assertGreaterEqual(result['legs'][1]['transfer_margin_seconds'],180)
    def test_access_walk_is_explicit_and_never_added_when_disabled(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("INSERT INTO stops VALUES('4','Other platform','43.0001','-88')")
            c.execute("UPDATE stop_times SET stop_id='4' WHERE trip_id='T' AND stop_sequence='1'")
        self.assertEqual(self.engine.itinerary('1','3',NOW,allow_walks=False)['status'],'no_route')
        result=self.engine.itinerary('1','3',NOW,allow_walks=True)
        self.assertEqual(result['legs'][0]['type'],'walk')
        self.assertGreaterEqual(result['legs'][1]['departure'],result['legs'][0]['arrival'])
    def test_source_shape_distances_clip_geometry_and_directions_come_from_gtfs(self):
        with self.engine.connect(readonly=False) as c:
            c.execute('ALTER TABLE shapes ADD COLUMN shape_dist_traveled TEXT')
            c.execute('ALTER TABLE stop_times ADD COLUMN shape_dist_traveled TEXT')
            c.execute('DELETE FROM shapes')
            c.executemany('INSERT INTO shapes VALUES(?,?,?,?,?)',[('X','43','-88',str(i),str(i)) for i in range(4)])
            c.execute("UPDATE stop_times SET shape_dist_traveled=stop_sequence WHERE trip_id='T'")
        r=self.engine.itinerary('1','2',NOW,allow_walks=False)
        self.assertEqual(r['legs'][0]['geometry_scope'],'scheduled_ride_segment')
        self.assertEqual(len(r['legs'][0]['geometry']),2)
        self.assertEqual(self.engine.locations('A')[0]['scheduled_directions'][0]['headsign'],'B')

class OfficialStopQualityTests(unittest.TestCase):
    @unittest.skipUnless(__import__('pathlib').Path('instance/schedule.sqlite').exists(),'official index not installed')
    def test_actual_wisconsin_cass_to_jackson_platforms(self):
        s=Schedule()
        for hour in [7,11,17]:
            now=datetime(2026,11,9,hour,tzinfo=TZ)
            result=s.itinerary('2783','66',now,allow_walks=False)
            self.assertTrue(result['nearby_trip'])
            self.assertFalse(any(l['to_stop']['name']=='17TH & WISCONSIN' for l in result['legs']))
            self.assertIn('9651',[r['stop_id'] for r in result['nearby_destination_stops']])
            direct=s.itinerary('2783','9651',now,allow_walks=False)
            self.assertEqual(direct['status'],'ok')
            self.assertEqual(len(direct['legs']),1)
        long_trip=s.itinerary('2783','7754',datetime(2026,11,9,11,tzinfo=TZ),allow_walks=False)
        self.assertFalse(any(l.get('route_number')=='14' and l['to_stop']['name']=='17TH & WISCONSIN' for l in long_trip['legs']))
        self.assertTrue(long_trip['nearby_origin_stops'] or long_trip['legs'])
        walk=s.itinerary('2783','66',datetime(2026,11,9,11,tzinfo=TZ),allow_walks=True)
        self.assertEqual([l['type'] for l in walk['legs']],['walk'])
        self.assertGreater(walk['duration_seconds'],120)
        self.assertLess(walk['duration_seconds'],600)

class ArrivalSafetyTests(unittest.TestCase):
    def test_invalid_uncertainty_and_old_prediction_never_notify(self):
        from push_service import reliable_prediction
        dep={'data_type':'realtime','prediction_at':1100,'prediction_reported_at':1000}
        self.assertTrue(reliable_prediction(dep,1000))
        self.assertFalse(reliable_prediction({**dep,'uncertainty_seconds':-1},1000))
        self.assertFalse(reliable_prediction({**dep,'prediction_reported_at':700},1000))
