"""Protected backups first, then optional operator-approved retention. Approved retention includes bounded encrypted-backup pruning."""
import argparse,os,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--backup-dir',type=Path,required=True);p.add_argument('--apply-approved-retention',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1]
name=datetime.now(timezone.utc).strftime('community-%Y%m%dT%H%M%S%fZ.sqlite.enc')
subprocess.run([sys.executable,str(root/'scripts/community_storage.py'),'--backup',str(a.backup_dir/name),'--encrypt-backup'],check=True)
if a.apply_approved_retention:
 if os.getenv('RETENTION_APPROVED')!='1':raise SystemExit('Backup complete. Retention needs RETENTION_APPROVED=1 from the operator.')
 subprocess.run([sys.executable,str(root/'scripts/community_storage.py'),'--purge-expired','--apply'],check=True)

# Only prune this tool's old encrypted backups, never arbitrary files or the newest two.
if a.apply_approved_retention:
    import re,time
    days=int(os.getenv('BACKUP_RETENTION_DAYS','30'))
    if not 7<=days<=365:raise SystemExit('BACKUP_RETENTION_DAYS must be 7–365')
    files=sorted((f for f in a.backup_dir.iterdir() if not f.is_symlink() and f.is_file() and re.fullmatch(r'community-\d{8}T\d{12}Z\.sqlite\.enc',f.name)),key=lambda f:f.name,reverse=True)
    for old in files[2:]:
        if old.stat().st_mtime<time.time()-days*86400:old.unlink()
