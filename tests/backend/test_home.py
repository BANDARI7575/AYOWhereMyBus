"""Home API contracts using isolated GTFS and community stores."""
import unittest
import time
from unittest.mock import patch
from google.transit import gtfs_realtime_pb2 as pb
from tests.backend import test_release
from backend import release_api
from backend.app import parse_vehicle_feed


class HomeTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_release.ApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.client = self.fixture.client

    def test_ai_page_is_text_only_shell(self):
        response = self.client.get('/ai')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn('AYO AI', html)
        self.assertIn('ai-chat.js', html)
        self.assertNotIn('disabled', html)
        self.assertNotIn('workspaces.js', html)
        self.assertNotIn('getUserMedia', html)

    def test_radius_tenths_and_legacy_choices_are_accepted_and_invalid_values_rejected(self):
        for radius in [i/10 for i in range(1,31)]+[.25,5]:
            with self.subTest(radius=radius):
                response=self.client.get('/api/explore/stops',query_string={'lat':43,'lon':-88,'radius':radius})
                self.assertEqual(response.status_code,200)
                self.assertTrue(all(s['distance_meters']<=radius*1609.344+.5 for s in response.json['stops']))
        for radius in ['0','0.05','0.15','3.1','nan','inf','-1']:
            self.assertEqual(self.client.get('/api/explore/stops',query_string={'lat':43,'lon':-88,'radius':radius}).status_code,400)

    def test_trip_shape_is_bound_to_the_exact_gtfs_trip(self):
        response=self.client.get('/api/trips/T/shape')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['trip_id'],'T')
        self.assertEqual(response.json['shape_id'],'X')
        self.assertEqual(response.json['points'],[[43.0,-88.0]])
        self.assertEqual(self.client.get('/api/trips/not-a-real-trip/shape').status_code,400)

    def test_departures_preserve_repeated_trips_and_expose_source_not_browser_timestamp(self):
        rows=[{'trip_id':str(i),'route_id':'R','scheduled_epoch':1800000000+i} for i in range(40)]
        feed=pb.FeedMessage();feed.header.gtfs_realtime_version='2.0';feed.header.timestamp=1799999990
        with patch.object(release_api.realtime,'apply',return_value=(rows,'fresh')),patch.object(release_api.realtime,'cache',{'updates':(0,feed,'fresh')}):
            default=self.client.get('/api/stops/1/departures').json
            complete=self.client.get('/api/stops/1/departures?limit=200').json
        self.assertEqual(len(default['departures']),30)
        self.assertEqual(len(complete['departures']),40)
        self.assertEqual(complete['total_departures'],40)
        self.assertFalse(complete['truncated'])
        self.assertEqual(complete['feed_timestamp'],1799999990)
        self.assertLess(abs(complete['retrieved_at']-time.time()),3)
        self.assertEqual(self.client.get('/api/stops/1/departures?limit=9999').status_code,400)

    def test_vehicle_descriptor_service_date_is_not_invented(self):
        feed=pb.FeedMessage();feed.header.gtfs_realtime_version='2.0'
        vehicle=feed.entity.add(id='bus').vehicle
        vehicle.trip.trip_id='T';vehicle.trip.route_id='R';vehicle.position.latitude=43;vehicle.position.longitude=-88
        self.assertIsNone(parse_vehicle_feed(feed.SerializeToString())['buses'][0]['trip_start_date'])
        vehicle.trip.start_date='20261115';vehicle.trip.start_time='25:05:00'
        result=parse_vehicle_feed(feed.SerializeToString())['buses'][0]
        self.assertEqual(result['trip_start_date'],'20261115')
        self.assertEqual(result['trip_start_time'],'25:05:00')

    def test_undated_vehicle_is_bound_to_unique_active_overnight_service(self):
        from datetime import datetime
        from backend.services.transit_engine import TZ
        from backend.services.feature_service import qualify_service_day
        schedule=self.fixture.engine
        reported=datetime(2026,11,10,0,15,tzinfo=TZ).timestamp()
        self.assertEqual(qualify_service_day(schedule,'T',reported),('20261109','unique_active_gtfs_occurrence'))
        self.assertEqual(qualify_service_day(schedule,'T',reported,'20261109'),('20261109','vehicle_trip_descriptor'))
        self.assertIsNone(qualify_service_day(schedule,'T',reported,'20261110'))
        self.assertIsNone(qualify_service_day(schedule,'T',reported,'bad-date'))
        self.assertIsNone(qualify_service_day(schedule,'T',reported+12*3600))

    def test_ambiguous_scheduled_occurrences_and_invalid_reports_fail_closed(self):
        from datetime import datetime
        from backend.services.transit_engine import TZ
        from backend.services.feature_service import qualify_service_day
        schedule=self.fixture.engine
        with schedule.connect(readonly=False) as c:
            c.execute("UPDATE stop_times SET arrival_time='00:00:00',departure_time='00:00:00' WHERE trip_id='T' AND stop_sequence='1'")
            c.execute("UPDATE stop_times SET arrival_time='30:00:00',departure_time='30:00:00' WHERE trip_id='T' AND stop_sequence='2'")
        reported=datetime(2026,11,10,1,0,tzinfo=TZ).timestamp()
        with patch.object(schedule,'services',return_value={'S'}):
            self.assertIsNone(qualify_service_day(schedule,'T',reported))
        for stamp in [None,True,float('nan'),float('inf')]:
            self.assertIsNone(qualify_service_day(schedule,'T',stamp))
        with schedule.connect(readonly=False) as c:c.execute("INSERT INTO frequencies(trip_id) VALUES('T')")
        self.assertIsNone(qualify_service_day(schedule,'T',reported,'20261109'),'Frequency templates need an instance start time, not trip ID alone')

    def test_vehicle_endpoint_requires_exact_trip_stop_and_unique_fresh_report(self):
        from datetime import datetime
        from backend.services.transit_engine import TZ
        now=datetime(2026,11,10,0,15,tzinfo=TZ).timestamp()
        bus={'bus_id':'verified','trip_id':'T','route':'R','reported_at':now,'trip_start_date':None,'latitude':43,'longitude':-88,'direction_id':0}
        fleet={'buses':[bus],'feed_timestamp':now}
        url='/api/trips/T/vehicle?service_date=20261109&stop_id=1&stop_sequence=1'
        with patch('backend.app.live_vehicles',return_value=fleet),patch('backend.services.feature_service.time.time',return_value=now):
            data=self.client.get(url).json
            self.assertEqual(data['status'],'matched')
            self.assertEqual(data['buses'][0]['qualified_service_date'],'20261109')
            self.assertIsNone(data['buses'][0]['trip_start_date'],'Do not fabricate a raw vehicle descriptor date')
            self.assertNotIn('reason',data)
            wrong_route={**bus,'route':'OTHER_ROUTE'}
            cases=[
                ('vehicle_not_reported',[],now),
                ('vehicle_not_reported',[{**bus,'trip_id':'U'}],now),
                ('stale_vehicle_feed',[bus],now-181),
                ('stale_vehicle_position',[{**bus,'reported_at':now-121}],now),
                ('stale_vehicle_position',[{**bus,'reported_at':None}],now),
                ('vehicle_route_mismatch',[wrong_route],now),
                ('vehicle_direction_mismatch',[{**bus,'direction_id':1}],now),
                ('vehicle_service_date_mismatch',[{**bus,'trip_start_date':'20261110'}],now),
                ('vehicle_trip_unverified',[{**bus,'trip_schedule_relationship':6}],now),
                ('ambiguous_vehicle_match',[bus,{**bus,'bus_id':'duplicate-bus'}],now),
            ]
            for reason,buses,stamp in cases:
                with self.subTest(reason=reason,buses=len(buses)), self.assertLogs('backend.app',level='WARNING') as logs:
                    fleet.update(buses=buses,feed_timestamp=stamp)
                    data=self.client.get(url).json
                    self.assertEqual((data['status'],data['reason'],data['buses']),('unavailable',reason,[]))
                    self.assertIn(f'vehicle_match_unavailable reason={reason}',logs.output[0])
                    self.assertNotRegex(logs.output[0],r'duplicate-bus|OTHER_ROUTE|latitude|longitude|stop_id|trip_id')
            fleet.update(buses=[wrong_route,bus],feed_timestamp=now)
            self.assertEqual([x['bus_id'] for x in self.client.get(url).json['buses']],['verified'])
            fleet['buses']=[wrong_route,{**bus,'direction_id':1}]
            with self.assertLogs('backend.app',level='WARNING') as logs:
                self.assertEqual(self.client.get(url).json['reason'],'vehicle_direction_mismatch')
            self.assertIn("'vehicle_route_mismatch': 1",logs.output[0])
            self.assertIn("'vehicle_direction_mismatch': 1",logs.output[0])

    def test_vehicle_endpoint_handles_provider_failure_without_logging_error_details(self):
        url='/api/trips/T/vehicle?service_date=20261109&stop_id=1&stop_sequence=1'
        with patch('backend.app.live_vehicles',side_effect=OSError('private request details')), self.assertLogs('backend.app',level='WARNING') as logs:
            response=self.client.get(url)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['reason'],'vehicle_feed_unavailable')
        self.assertEqual(response.json['buses'],[])
        self.assertNotIn('private request details',response.get_data(as_text=True)+logs.output[0])

    def test_vehicle_endpoint_rejects_invalid_or_mismatched_departure_identity(self):
        for query in ['service_date=20261110&stop_id=1&stop_sequence=1','service_date=20261109&stop_id=3&stop_sequence=1','service_date=20261109&stop_id=1&stop_sequence=999999999999999999999','service_date=20261109&stop_id=1&stop_sequence=1.5','service_date=bad&stop_id=1&stop_sequence=1']:
            self.assertEqual(self.client.get('/api/trips/T/vehicle?'+query).status_code,400)
