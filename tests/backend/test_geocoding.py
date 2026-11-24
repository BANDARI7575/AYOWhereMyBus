"""Optional geocoder contracts without external requests or real credentials."""
import json
import os
import unittest
from unittest.mock import MagicMock, patch
from tests.backend import test_home


class GeocodingTests(unittest.TestCase):
    setUp = test_home.HomeTests.setUp
    def test_geocoder_configuration_and_missing_credentials(self):
        with patch.dict(os.environ, {'GEOAPIFY_API_KEY': ''}):
            self.assertFalse(self.client.get('/api/location-config').json['configured'])
            self.assertEqual(self.client.post('/api/location-search', json={'consent': True, 'q': 'Milwaukee address'}).status_code, 503)

    def test_geocoder_validates_deduplicates_and_keeps_token_server_side(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'results': [
            {'formatted': 'Verified address', 'lat': 43.04, 'lon': -87.9},
            {'formatted': 'Verified address', 'lat': 43.04, 'lon': -87.9},
            {'formatted': 'Invalid', 'lat': 999, 'lon': -87.9},
        ]}).encode()
        with patch.dict(os.environ, {'GEOAPIFY_API_KEY': 'test-secret-only'}), patch('backend.services.geocoding_service.fetch_feed', return_value=response.__enter__.return_value.read.return_value) as upstream:
            result = self.client.post('/api/location-search', json={'consent': True, 'q': 'Test address', 'lang': 'es'})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(len(result.json['locations']), 1)
            self.assertEqual(result.json['locations'][0]['kind'], 'place')
            self.assertNotIn('test-secret-only', result.get_data(as_text=True))
            self.assertIn('proximity%3A-87.9065%2C43.0389', upstream.call_args.args[0])
            upstream.assert_called_once()
            assert len(upstream.call_args.args) == 1
            assert not upstream.call_args.kwargs
            self.assertEqual(result.headers['Cache-Control'], 'no-store')

    def test_geocoder_invalid_query_and_upstream_failure(self):
        self.assertEqual(self.client.post('/api/location-search', json={'consent': True, 'q': []}).status_code, 400)
        with patch.dict(os.environ, {'GEOAPIFY_API_KEY': 'test-secret-only'}), patch('backend.services.geocoding_service.fetch_feed', side_effect=TimeoutError('private URL')):
            result = self.client.post('/api/location-search', json={'consent': True, 'q': 'Valid query'})
            self.assertEqual(result.status_code, 502)
            self.assertNotIn('private URL', result.get_data(as_text=True))



def test_destination_requires_explicit_consent():
    from flask import Flask
    from unittest.mock import patch
    from backend.services import geocoding_service as svc
    app = Flask(__name__)
    # Denied requests must not even access the quota database.
    svc.install_geocoding(app, lambda: (_ for _ in ()).throw(AssertionError("Unexpected database access")))
    with patch.dict('os.environ', {'GEOAPIFY_API_KEY': 'test-only'}),          patch.object(svc, 'fetch_feed') as upstream, app.test_client() as client:
        for payload in ({'q': 'Milwaukee City Hall'},
                        {'q': 'Milwaukee City Hall', 'consent': False},
                        {'q': 'Milwaukee City Hall', 'consent': 1}, []):
            result = client.post('/api/location-search', json=payload)
            assert result.status_code == 400
        upstream.assert_not_called()
