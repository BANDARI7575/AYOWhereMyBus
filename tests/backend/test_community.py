"""Community submissions use only temporary fixture schedules and SQLite stores."""
from contextlib import closing
import concurrent.futures
import csv
import json
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from tests.backend.test_release import ApiTests
from backend import release_api
from backend.services.community_service import CATEGORIES, NEARBY_BODY_LIMIT, NEARBY_STOP_LIMIT, clean_comment


class CommunityTests(ApiTests):
    def post(self, data, address='192.0.2.1'):
        return self.client.post('/api/winter/reports', json=data, environ_overrides={'REMOTE_ADDR': address})

    def test_scoped_count_exceeds_global_limit_and_respects_public_expiry(self):
        now = int(time.time())
        nearby = [('1', f'Nearby report {i}', 'approved', now-600, now+800) for i in range(101)]
        outside = [('2', f'Outside report {i}', 'approved', now-100, now+800) for i in range(101)]
        excluded = [
            ('1', 'Pending', 'pending', now-10, now+50),
            ('1', 'Rejected', 'rejected', now-10, now+50),
            ('1', 'Stored expiry boundary', 'approved', now-10, now),
            ('1', '24 hour boundary', 'approved', now-86400, now+50),
        ]
        with release_api.db() as c:
            c.executemany('INSERT INTO reports(stop_id,text,state,created,expires) VALUES (?,?,?,?,?)',
                          nearby + outside + excluded + [('1', 'One second left', 'approved', now-86399, now+50)])
            c.execute("INSERT INTO votes VALUES (102,'test',1)")
        with patch('backend.release_api.time.time', return_value=now):
            result = self.client.post('/api/winter/reports/nearby', json={'stop_ids': ['1', '1']})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.headers['Cache-Control'], 'no-store')
            self.assertEqual(result.json['count'], 102)
            self.assertEqual(result.json['retrieved_at'], now)
            rows = result.json['reports']
            self.assertEqual(len(rows), 102)
            self.assertEqual({row['text'] for row in rows}, {row[1] for row in nearby} | {'One second left'})
            self.assertEqual(rows[-1]['expires'], now+1)
            self.assertEqual(rows[-1]['category_labels'], CATEGORIES['other'])
            self.assertNotIn('votes', rows[0])
            global_rows = self.client.get('/api/winter/reports').json['reports']
            self.assertEqual(len(global_rows), 100)
            self.assertEqual({row['stop_id'] for row in global_rows}, {'2'})
            self.assertIn('votes', global_rows[0])
        with patch('backend.release_api.time.time', return_value=now+1):
            self.assertEqual(self.client.post('/api/winter/reports/nearby', json={'stop_ids': ['1']}).json['count'], 101)

    def test_scoped_report_request_limits_and_validation(self):
        url = '/api/winter/reports/nearby'
        for headers in ({'Origin': 'https://example.org'}, {'Sec-Fetch-Site': 'cross-site'}):
            self.assertEqual(self.client.post(url, json={'stop_ids': ['1']}, headers=headers).status_code, 403)
        for payload in ({}, {'stop_ids': '1'}, {'stop_ids': ['1'], 'lat': 43},
                        *({'stop_ids': [stop]} for stop in ('', '1\n', ' 1', 'x'*129, True, 1, [], '1\x00'))):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(url, json=payload).status_code, 400)
        self.assertEqual(self.client.post(url, json={'stop_ids': ['1']*(NEARBY_STOP_LIMIT+1)}).status_code, 400)
        self.assertEqual(self.client.post(url, json={'stop_ids': ['x'*128]*300}).status_code, 413)
        nested = '{"stop_ids":' + '['*2000 + ']'*2000 + '}'
        self.assertEqual(self.client.post(url, data=nested, content_type='application/json').status_code, 400)
        self.assertEqual(self.client.post(url, json={'stop_ids': []}).json['count'], 0)
        self.assertEqual(self.post({'stop_id': '1', 'text': 'x'*4096}).status_code, 413)

    def test_bundled_stop_set_fits_nearby_request_limits(self):
        # The complete feed is an upper bound for every three-mile radius.
        source = release_api.PROJECT_ROOT / 'data' / 'google_transit' / 'stops.txt'
        with source.open(newline='', encoding='utf-8-sig') as stream:
            ids = sorted({row['stop_id'] for row in csv.DictReader(stream) if row['location_type'] in ('', '0')})
        body = json.dumps({'stop_ids': ids}, separators=(',', ':'))
        self.assertLessEqual(len(ids), NEARBY_STOP_LIMIT)
        self.assertLessEqual(len(body.encode()), NEARBY_BODY_LIMIT)
        result = self.client.post('/api/winter/reports/nearby', data=body, content_type='application/json')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['count'], 0)

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
