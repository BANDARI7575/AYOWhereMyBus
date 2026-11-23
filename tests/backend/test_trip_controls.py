"""Planner timing/flags through Flask and the real isolated GTFS engine."""
import unittest
import time
from datetime import datetime, timedelta
from unittest.mock import patch
from tests.backend import test_release
from backend import release_api
from backend.services.transit_engine import TZ


class TripControlsTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_release.ApiTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.client = self.fixture.client

    def test_leave_now_uses_request_clock_and_chicago_timezone(self):
        before = int(time.time())
        with patch.object(self.fixture.engine, 'itinerary', wraps=self.fixture.engine.itinerary) as plan:
            response = self.client.get('/api/journeys?from=1&to=3&walking=1')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json['requested_at'], before)
        self.assertLessEqual(response.json['requested_at'], int(time.time()))
        self.assertEqual(response.json['timezone'], 'America/Chicago')
        self.assertNotIn('requested_departure_at', response.json)
        self.assertEqual(plan.call_args.kwargs, {'allow_walks': True})

    def test_future_milwaukee_departure_and_walking_flags_reach_engine(self):
        for walking in (False, True):
            departure = datetime.now(TZ) + timedelta(minutes=30 + int(walking))
            with patch.object(self.fixture.engine, 'itinerary', wraps=self.fixture.engine.itinerary) as plan:
                response = self.client.get('/api/journeys', query_string={
                    'from': '1', 'to': '3', 'walking': str(int(walking)),
                    'depart_at': departure.isoformat()})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(plan.call_args.kwargs['allow_walks'], walking)
            self.assertEqual(plan.call_args.kwargs['now'].timestamp(), departure.timestamp())
            self.assertEqual(response.json['requested_departure_at'], int(departure.timestamp()))

    def test_switch_from_future_to_now_does_not_reuse_future_cache_entry(self):
        future = datetime.now(TZ) + timedelta(minutes=30)
        with patch.object(self.fixture.engine, 'itinerary', wraps=self.fixture.engine.itinerary) as plan:
            scheduled = self.client.get('/api/journeys', query_string={
                'from': '1', 'to': '3', 'walking': '1', 'depart_at': future.isoformat()})
            before = int(time.time())
            immediate = self.client.get('/api/journeys?from=1&to=3&walking=1')
        self.assertEqual(scheduled.status_code, 200)
        self.assertEqual(immediate.status_code, 200)
        self.assertEqual(plan.call_count, 2, 'Leave now must not return the future departure cache entry')
        self.assertEqual(plan.call_args.kwargs, {'allow_walks': True})
        self.assertNotIn('requested_departure_at', immediate.json)
        self.assertGreaterEqual(immediate.json['requested_at'], before)
        self.assertLessEqual(immediate.json['requested_at'], int(time.time()))
        self.assertEqual(immediate.json['timezone'], 'America/Chicago')

    def test_invalid_time_and_unknown_stops_are_errors_not_routes(self):
        for args in ({'from': 'unknown', 'to': '3'},
                     {'from': '1', 'to': '3', 'depart_at': '2020-01-01T12:00:00-06:00'},
                     {'from': '1', 'to': '3', 'depart_at': '2030-01-01T12:00:00'}):
            response = self.client.get('/api/journeys', query_string=args)
            self.assertEqual(response.status_code, 400)
            self.assertNotIn('legs', response.json)
