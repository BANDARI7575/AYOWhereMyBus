"""One local worker per persistent store. Sends only explicitly opted-in Web Push."""
import fcntl
import logging
import os
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from release_api import db,schedule,realtime,DB
from push_service import tick,validate_configuration
validate_configuration()
lock_path=Path(DB).parent/'alerts-worker.lock'
lock_path.parent.mkdir(parents=True,exist_ok=True)
with lock_path.open('w') as lock:
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('An alert worker already owns this store')
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    while True:
        try:logging.info('arrival_worker sent=%d',tick(db,schedule,realtime))
        except Exception as error:logging.error('arrival_worker failure=%s',type(error).__name__)
        time.sleep(30)
