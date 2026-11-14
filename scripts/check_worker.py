"""Local worker heartbeat health check; no push endpoint or rider information output."""
import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.release_api import db
with db() as c:r=c.execute("SELECT heartbeat FROM worker_status WHERE name='push'").fetchone()
raise SystemExit(0 if r and -60<=time.time()-r[0]<=90 else 1)
