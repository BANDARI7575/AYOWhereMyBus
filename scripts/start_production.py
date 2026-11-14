"""Validate persistent storage/index, then run Gunicorn. Never rebuild on restart."""
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.chdir(ROOT)
os.environ['AYO_ENV']='production'
from backend.app import app
from backend.release_api import schedule,db
with schedule.connect() as c:
    if c.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise RuntimeError('Schedule integrity check failed')
    tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'transfers','frequencies','stops','trips','stop_times'}<=tables: raise RuntimeError('Prepare the current schedule index before startup')
with db() as c: c.execute('SELECT 1 FROM reports LIMIT 1').fetchall()
os.execv(sys.executable,[sys.executable,'-m','gunicorn','-c','gunicorn.conf.py','app:app'])
