"""Offline SQLite backup and retention maintenance; use a protected backup folder."""
from contextlib import closing
import argparse
import sqlite3
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.release_api import db
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--backup',type=Path)
p.add_argument('--encrypt-backup',action='store_true',help='Encrypt with BACKUP_ENCRYPTION_KEY; preserves no plaintext backup')
p.add_argument('--purge-expired',action='store_true',help='Delete reports expired more than seven days ago and orphan votes')
p.add_argument('--apply',action='store_true',help='Apply retention deletion; without this flag retention is a dry run')
a=p.parse_args()
if a.backup:
    import os,tempfile
    if a.backup.exists(): p.error('Backup target already exists; choose a new filename')
    a.backup.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    if a.encrypt_backup:
        from cryptography.fernet import Fernet
        if not os.getenv('BACKUP_ENCRYPTION_KEY'):p.error('BACKUP_ENCRYPTION_KEY is required')
        cipher=Fernet(os.environ['BACKUP_ENCRYPTION_KEY'].encode())
        with tempfile.NamedTemporaryFile(dir=a.backup.parent,suffix='.sqlite') as temporary:
            with db() as source,closing(sqlite3.connect(temporary.name)) as target:source.backup(target)
            if os.path.getsize(temporary.name)>64*1024*1024:p.error('Encrypted local backup exceeds the 64 MiB memory profile; configure reviewed streaming/off-host encrypted backup before increasing capacity')
            data=cipher.encrypt(Path(temporary.name).read_bytes())
            with a.backup.open('xb') as out:a.backup.chmod(0o600);out.write(data)
    else:
        with db() as source, closing(sqlite3.connect(a.backup)) as target: source.backup(target)
        a.backup.chmod(0o600)
    print('Encrypted backup written' if a.encrypt_backup else 'Backup written')
if a.purge_expired:
    import os
    if a.apply and os.getenv('AYO_ENV')=='production' and os.getenv('RETENTION_APPROVED')!='1':p.error('Set RETENTION_APPROVED=1 only after the operator approves the retention policy')
    with db() as c:
        cutoff=int(time.time())-7*86400
        count=c.execute('SELECT COUNT(*) FROM reports WHERE expires<?',(cutoff,)).fetchone()[0]
        watches=c.execute('SELECT COUNT(*) FROM push_watches WHERE expires<=?',(int(time.time()),)).fetchone()[0]
        if a.apply:
            c.execute('DELETE FROM report_flags WHERE report_id IN (SELECT id FROM reports WHERE expires<?)',(cutoff,))
            c.execute('DELETE FROM push_deliveries WHERE watch_id IN (SELECT id FROM push_watches WHERE expires<=?)',(int(time.time()),))
            c.execute('DELETE FROM push_watches WHERE expires<=?',(int(time.time()),))
            c.execute('DELETE FROM push_deliveries WHERE watch_id NOT IN (SELECT id FROM push_watches)')
            c.execute('DELETE FROM reports WHERE expires<?',(cutoff,))
            c.execute('DELETE FROM votes WHERE report_id NOT IN (SELECT id FROM reports)')
            if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='voice_admission'").fetchone():c.execute('DELETE FROM voice_admission WHERE day<?',(int(time.time()//86400)-2,))
            c.execute('DELETE FROM moderation_audit WHERE at<?',(int(time.time())-30*86400,))
    print(('Purged' if a.apply else 'Dry run: would purge')+' expired reports:',count,'; expired watches:',watches)
