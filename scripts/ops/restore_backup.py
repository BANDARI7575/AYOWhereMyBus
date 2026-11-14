"""Authenticate/decrypt an encrypted backup into a NEW path; never overwrites a database."""
import argparse,os,sqlite3
from pathlib import Path
from cryptography.fernet import Fernet
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);a=p.parse_args()
if a.destination.exists():p.error('Choose a new destination; active databases cannot be overwritten')
if a.source.stat().st_size>90*1024*1024:p.error('Backup exceeds the reviewed local restore memory profile')
if not os.getenv('BACKUP_ENCRYPTION_KEY'):p.error('BACKUP_ENCRYPTION_KEY is required')
plain=Fernet(os.environ['BACKUP_ENCRYPTION_KEY'].encode()).decrypt(a.source.read_bytes())
a.destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
# SQLite backup files may retain WAL header flags; immutable read validates the
# complete backup without trying to create an in-memory WAL/SHM file.
import tempfile
with tempfile.NamedTemporaryFile(dir=a.destination.parent,suffix='.sqlite') as temporary:
    temporary.write(plain);temporary.flush()
    c=sqlite3.connect(Path(temporary.name).resolve().as_uri()+'?immutable=1',uri=True)
    try:
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise SystemExit('Backup integrity check failed')
        if not c.execute("SELECT 1 FROM sqlite_master WHERE name='reports' AND type='table'").fetchone():raise SystemExit('Not an AYO community backup')
    finally:c.close()
with a.destination.open('xb') as target:a.destination.chmod(0o600);target.write(plain)
print('Authenticated backup restored to new destination. No active state was switched.')
