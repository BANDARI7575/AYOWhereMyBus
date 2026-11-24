"""Community submissions use only temporary fixture schedules and SQLite stores."""
from contextlib import closing
import concurrent.futures
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from tests.backend.test_release import ApiTests
from backend import release_api
from backend.services.community_service import CATEGORIES, clean_comment


class CommunityTests(ApiTests):
    def post(self, data, address='192.0.2.1'):
        return self.client.post('/api/winter/reports', json=data, environ_overrides={'REMOTE_ADDR': address})

    def test_categories_and_optional_comment_follow_moderation_and_expiry(self):
        config = self.client.get('/api/community/config').json
        self.assertEqual({x['id'] for x in config['categories']}, set(CATEGORIES))
        now = int(time.time())
        with patch('backend.release_api.time.time', return_value=now):
            response = self.post({'stop_id': '1', 'category': 'snow_ice'})
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json['state'], 'pending')
            self.assertEqual(response.json['expires'] - response.json['created'], 86400)
            self.assertEqual(self.client.get('/api/winter/reports').json['reports'], [])
            with patch.dict('os.environ', {'MODERATOR_TOKEN': 'test'}):
                queue = self.client.get('/api/moderation/queue', headers={'Authorization': 'Bearer test'}).json
                self.assertEqual(queue['reports'][0]['category'], 'snow_ice')
                approved = self.client.post('/api/moderation/reports/' + str(response.json['id']), json={'state': 'approved'}, headers={'Authorization': 'Bearer test'})
                self.assertEqual(approved.json['updated'], 1)
            report = self.client.get('/api/winter/reports').json['reports'][0]
            self.assertEqual(report['category_labels']['es'], 'Nieve o hielo')
            self.assertEqual(report['text'], '')
        with patch('backend.release_api.time.time', return_value=now + 86399):
            self.assertEqual(len(self.client.get('/api/winter/reports').json['reports']), 1)
        with patch('backend.release_api.time.time', return_value=now + 86400):
            self.assertEqual(self.client.get('/api/winter/reports').json['reports'], [])

    def test_invalid_input_is_rejected_without_records(self):
        valid = {'stop_id': '1', 'category': 'lighting', 'comment': ''}
        cases = [{'stop_id': True}, {'stop_id': []}, {'stop_id': 'missing'}, {'category': 'safe'}, {'category': []}, {'comment': None}, {'comment': 'x' * 501}, {'comment': '<script>bad</script>'}, {'comment': '＜img src=x＞'}, {'comment': 'https://example.com'}, {'comment': 'www.example.com'}, {'comment': 'example.org'}, {'comment': 'qa@example.org'}, {'comment': 'Call 414-555-0123'}, {'comment': 'Hidden\x00control'}, {'comment': 'Direction\u202etext'}, {'state': 'approved'}, {'expires': 9999999999}]
        for i, change in enumerate(cases):
            self.assertEqual(self.post({**valid, **change}, '192.0.2.' + str(i + 1)).status_code, 400, change.keys())
        with release_api.db() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 0)
        self.assertEqual(clean_comment('  Nieve\n  en la parada  '), 'Nieve en la parada')
        self.assertEqual(clean_comment('Observed on 11-24-2026'), 'Observed on 11-24-2026')

    def test_duplicate_normalization_and_hourly_limit(self):
        first = self.post({'stop_id': '1', 'category': 'lighting', 'comment': '  Luz\n  apagada '})
        self.assertEqual(first.status_code, 202)
        self.assertEqual(self.post({'stop_id': '1', 'category': 'lighting', 'comment': 'LUZ APAGADA'}, '192.0.2.2').status_code, 409)
        self.assertEqual(self.post({'stop_id': '1', 'category': 'lighting', 'comment': 'Different observation one'}).status_code, 202)
        self.assertEqual(self.post({'stop_id': '1', 'category': 'lighting', 'comment': 'Different observation two'}).status_code, 202)
        self.assertEqual(self.post({'stop_id': '1', 'category': 'lighting', 'comment': 'Different observation three'}).status_code, 429)

    def test_concurrent_identical_reports_are_not_both_accepted(self):
        from backend.app import app
        def submit(index):
            with app.test_client() as client:
                return client.post('/api/winter/reports', json={'stop_id': '1', 'category': 'blocked_access'}, environ_overrides={'REMOTE_ADDR': '192.0.2.' + str(index)}).status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(submit, [11, 12])), [202, 409])

    def test_existing_reports_survive_additive_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'legacy.sqlite'
            with closing(sqlite3.connect(path)) as c:
                c.execute("CREATE TABLE reports(id INTEGER PRIMARY KEY,stop_id TEXT,text TEXT,state TEXT DEFAULT 'pending',created INTEGER,expires INTEGER)")
                c.execute("INSERT INTO reports VALUES(1,'1','Existing observation','approved',?,?)", (int(time.time()), int(time.time()) + 600))
                c.commit()
            with patch.object(release_api, 'DB', str(path)):
                rows = self.client.get('/api/winter/reports').json['reports']
                self.assertEqual(rows[0]['text'], 'Existing observation')
                self.assertEqual(rows[0]['category'], 'other')
