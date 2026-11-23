"""Verify a trusted local release artifact without extracting or executing its code."""
import argparse,hashlib,json,tarfile
from pathlib import PurePosixPath
p=argparse.ArgumentParser(description=__doc__);p.add_argument('artifact');p.add_argument('--sha256',required=True);a=p.parse_args()
from pathlib import Path
if hashlib.sha256(Path(a.artifact).read_bytes()).hexdigest()!=a.sha256:raise SystemExit('Artifact checksum mismatch')
with tarfile.open(a.artifact,'r:gz') as archive:
    names=archive.getnames()
    if len(names)!=len(set(names)):raise SystemExit('Duplicate archive paths')
    for info in archive.getmembers():
        if not info.isfile() or PurePosixPath(info.name).is_absolute() or '..'in PurePosixPath(info.name).parts:raise SystemExit('Unsafe artifact entry')
    manifest=json.load(archive.extractfile('release-manifest.json'))
    files=manifest['files']
    release=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()[:16]
    if release!=manifest['release_id']:raise SystemExit('Release identity mismatch')
    if set(names)!=set(files)|{'release-manifest.json'}:raise SystemExit('Unmanifested artifact files')
    for name,checksum in files.items():
        if hashlib.sha256(archive.extractfile(name).read()).hexdigest()!=checksum:raise SystemExit('Source checksum mismatch')
print('Verified local release',release,'with',len(files),'files. Nothing executed or deployed.')
