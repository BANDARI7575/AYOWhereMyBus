"""Regression contracts for relocation without changing public application behavior."""
import json
import os
import re
import unittest
from unittest.mock import patch

import app as launcher
from backend.app import app
from backend.paths import PROJECT_ROOT
from backend.transit_engine import Schedule


class OrganizationTests(unittest.TestCase):
    def test_compatible_launcher_exposes_the_same_application(self):
        self.assertIs(launcher.app, app)

    def test_homepage_and_renamed_assets_remain_accessible(self):
        client = app.test_client()
        for path in ['/', '/static/weather.js', '/static/rider-tools.js',
                     '/static/navigation.js', '/static/pwa.js', '/sw.js']:
            with self.subTest(path=path):
                response = client.get(path)
                self.assertEqual(response.status_code, 200)
                response.close()

    def test_default_schedule_paths_remain_outside_backend_package(self):
        with patch.dict(os.environ, {}, clear=True):
            schedule = Schedule()
        self.assertEqual(schedule.source, PROJECT_ROOT / 'google_transit')
        self.assertEqual(schedule.database, str(PROJECT_ROOT / 'instance/schedule.sqlite'))
        self.assertEqual(app.static_folder, str(PROJECT_ROOT / 'static'))

    def test_every_precached_shell_asset_exists_after_renaming(self):
        worker = (PROJECT_ROOT / 'static/sw.js').read_text()
        assets = json.loads(re.search(r'const SHELL=(\[.*?\]);', worker, re.S)[1])
        for asset in assets:
            with self.subTest(asset=asset):
                local = PROJECT_ROOT / ('index.html' if asset == '/' else asset.lstrip('/'))
                self.assertTrue(local.is_file(), asset)
