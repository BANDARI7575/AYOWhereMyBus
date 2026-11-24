"""Persistent shared UTC-day request budget; counts attempted upstream calls, not billed credits."""
import time

DAILY_REQUEST_LIMIT = 500


def reserve(c, *, day=None, legacy_walking=None):
    day = int(time.time() // 86400) if day is None else day
    # The first write obtains the SQLite writer lock, including across workers.
    c.execute('CREATE TABLE IF NOT EXISTS geoapify_budget(day INTEGER PRIMARY KEY, count INTEGER NOT NULL)')
    c.execute('DELETE FROM geoapify_budget WHERE day<?', (day,))
    if legacy_walking is None:
        exists = c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='walking_budget'").fetchone()
        old = c.execute('SELECT count FROM walking_budget WHERE day=?', (day,)).fetchone() if exists else None
        legacy_walking = old[0] if old else 0
    c.execute('INSERT INTO geoapify_budget VALUES (?,?) ON CONFLICT(day) DO NOTHING', (day, legacy_walking))
    return c.execute('UPDATE geoapify_budget SET count=count+1 WHERE day=? AND count<?', (day, DAILY_REQUEST_LIMIT)).rowcount == 1
