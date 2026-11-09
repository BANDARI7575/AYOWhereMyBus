"""Create a local versioned source artifact. Never pushes, commits or deploys."""
import argparse,hashlib,io,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
files=[]
for name in ['static','scripts','deploy','google_transit','tests','docs']:
    files.extend(f for f in (ROOT/name).rglob('*') if f.is_file() and '__pycache__' not in f.parts and '.backup.' not in f.name and f.name not in ['.DS_Store','release-artifact.json'] and f.suffix not in ['.pyc','.sqlite','.gz'])
files.extend(f for f in ROOT.glob('*.py') if '.backup.' not in f.name)
files.extend(ROOT/n for n in ['index.html','requirements.txt','requirements.lock','package.json','package-lock.json','Dockerfile','.dockerignore','.env.example','README.md'])
manifest={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(set(files))}
release_id=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:16]
a.output.parent.mkdir(parents=True,exist_ok=True)
with a.output.open('xb') as stream,tarfile.open(fileobj=stream,mode='w:gz') as archive:
    for relative in sorted(manifest):
        data=(ROOT/relative).read_bytes();info=tarfile.TarInfo(relative);info.size=len(data);info.mode=0o644;info.mtime=0;archive.addfile(info,io.BytesIO(data))
    data=json.dumps({'release_id':release_id,'files':manifest},sort_keys=True,indent=2).encode();info=tarfile.TarInfo('release-manifest.json');info.size=len(data);info.mode=0o644;archive.addfile(info,io.BytesIO(data))
checksum=hashlib.sha256(a.output.read_bytes()).hexdigest()
print(json.dumps({'release_id':release_id,'artifact':str(a.output.resolve()),'sha256':checksum,'files':len(manifest)},indent=2))
