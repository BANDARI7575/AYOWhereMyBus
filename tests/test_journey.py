"""Rider itinerary contract tests using deterministic GTFS, never live predictions."""
from datetime import datetime
from unittest.mock import patch
import test_release
from transit_engine import TZ
import release_api

NOW = datetime(2026, 11, 10, 0, 0, tzinfo=TZ)

class JourneyTests(test_release.ScheduleTests):
    def setUp(self):
        super().setUp()
        with self.engine.connect(readonly=False) as c:
            c.execute("UPDATE stops SET stop_name='Wisconsin & 6th' WHERE stop_id='1'")
            c.execute("UPDATE stops SET stop_name='Wisconsin & 7th' WHERE stop_id='2'")
            c.execute("UPDATE stops SET stop_name='Airport' WHERE stop_id='3'")
            c.execute("UPDATE routes SET route_short_name='30',route_long_name='Wisconsin Avenue'")
    def test_named_transfer_itinerary_and_trip_geometry(self):
        result = self.engine.itinerary('1', '3', NOW)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['origin']['name'], 'Wisconsin & 6th')
        self.assertEqual(result['destination']['name'], 'Airport')
        self.assertEqual(result['transfers'], 1)
        self.assertEqual(result['duration_seconds'], 25 * 60)
        self.assertEqual(result['initial_wait_seconds'], 10 * 60)
        self.assertEqual(result['legs'][0]['route_number'], '30')
        self.assertEqual(result['legs'][0]['geometry'], [[43.0, -88.0]])
        self.assertEqual(result['legs'][0]['trip_id'], 'T')
        self.assertEqual(result['legs'][1]['departure'] - result['legs'][0]['arrival'], 300)
        self.assertEqual(result['data_type'], 'scheduled')
    def test_stop_name_search_and_nearby_radius(self):
        self.assertEqual([r['stop_id'] for r in self.engine.locations('6TH wisconsin')], ['1'])
        self.assertEqual(self.engine.locations('unavailable address'), [])
        nearby = self.engine.locations(latitude=43, longitude=-88)
        self.assertEqual(nearby[0]['stop_id'], '1')
        self.assertEqual(nearby[0]['distance_meters'], 0)
        self.assertNotIn('3', [r['stop_id'] for r in nearby])
        self.assertEqual(self.engine.locations(latitude=0, longitude=0), [])
    def test_no_route_and_same_stop(self):
        result = self.engine.itinerary('1', '3', datetime(2026, 11, 11, tzinfo=TZ))
        self.assertEqual(result['status'], 'no_route')
        self.assertIsNone(result['duration_seconds'])
        self.assertEqual(result['legs'], [])
        with self.assertRaises(ValueError): self.engine.itinerary('1', '1', NOW)
    def test_missing_shape_keeps_instructions(self):
        with self.engine.connect(readonly=False) as c: c.execute('DELETE FROM shapes')
        result = self.engine.itinerary('1', '3', NOW)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['legs'][0]['geometry'], [])
    def test_estimated_walking_connection_has_no_invented_path(self):
        with self.engine.connect(readonly=False) as c:
            c.execute("INSERT INTO stops VALUES ('4','Transfer across street','43.0101','-88')")
            c.execute("UPDATE stop_times SET stop_id='4' WHERE trip_id='U' AND stop_id='2'")
        result = self.engine.itinerary('1', '3', NOW)
        walking = [leg for leg in result['legs'] if leg['type'] == 'walk']
        self.assertEqual(len(walking), 1)
        self.assertTrue(walking[0]['estimated'])
        self.assertEqual(walking[0]['geometry'], [])
        self.assertEqual(walking[0]['from_stop']['name'], 'Wisconsin & 7th')
        self.assertEqual(walking[0]['to_stop']['name'], 'Transfer across street')
        self.assertGreater(walking[0]['duration_seconds'], 0)
    def test_search_api_and_coordinate_validation(self):
        from app import app
        with patch.object(release_api, 'schedule', self.engine), patch.object(release_api, 'DB', self.database_path()):
            client = app.test_client()
            response = client.get('/api/journey-locations?q=Wisconsin')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json['locations']), 2)
            self.assertFalse(response.json['address_search_available'])
            for query in ['q=a', 'lat=nan&lon=1', 'lat=43', 'lat=100&lon=0']:
                self.assertEqual(client.get('/api/journey-locations?' + query).status_code, 400)
            self.assertEqual(client.get('/api/journey-locations?lat=0&lon=0').json['locations'], [])
    def database_path(self):
        return self.tmp.name + '/community.sqlite'
    def test_journey_api_preserves_schedule_contract(self):
        from app import app
        with patch.object(release_api, 'schedule', self.engine), patch.object(release_api, 'DB', self.database_path()), patch('release_api.datetime') as clock:
            clock.now.return_value = NOW
            # itinerary supplies its own clock; pin the method at its boundary.
            original = self.engine.itinerary
            with patch.object(self.engine, 'itinerary', side_effect=lambda a,b,**options: original(a,b,NOW,**options)):
                client = app.test_client()
                response = client.get('/api/journeys?from=1&to=3')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json['legs'][0]['from_stop']['name'], 'Wisconsin & 6th')
                self.assertEqual(client.get('/api/journeys?from=1&to=1').status_code, 400)

    def test_running_api_capability_and_revision_are_observable(self):
        from app import app
        with patch.object(release_api, 'DB', self.database_path()):
            response = app.test_client().get('/api/health')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['planner_api_version'], 1)
            self.assertEqual(response.json['source_revision'], response.headers['X-AYO-Revision'])
            self.assertTrue(response.json['started_at'])
