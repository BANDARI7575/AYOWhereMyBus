"""Stage, index and audit a GTFS archive; never activates it or restarts a service."""
import argparse,hashlib,json,os,ssl,subprocess,sys,tempfile,urllib.request,zipfile
import certifi
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from transit_engine import Schedule,TZ
ALLOWED={'agency.txt','stops.txt','routes.txt','trips.txt','stop_times.txt','calendar.txt','calendar_dates.txt','shapes.txt','transfers.txt','frequencies.txt','feed_info.txt','translations.txt','attributions.txt'}
def unpack(source,destination):
    total=0;seen=set()
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            parts=Path(info.filename).parts
            if '..' in parts or info.filename.startswith('/') or info.flag_bits&1 or (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Unsafe archive entry')
            name=Path(info.filename).name
            if info.is_dir() or name not in ALLOWED:continue
            if name in seen:raise ValueError('Duplicate GTFS filename')
            seen.add(name);total+=info.file_size
            if total>256*1024*1024 or info.file_size>64*1024*1024:raise ValueError('GTFS archive size limit exceeded')
            with archive.open(info) as src,(destination/name).open('xb') as dst:
                count=0
                while chunk:=src.read(65536):
                    count+=len(chunk)
                    if count>info.file_size or count>64*1024*1024:raise ValueError('Archive expanded beyond declared size')
                    dst.write(chunk)
    if not {'stops.txt','routes.txt','trips.txt','stop_times.txt'}<=seen:raise ValueError('Missing required GTFS files')
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--zip',type=Path);a=p.parse_args()
    if a.output.exists():p.error('Choose a NEW output directory')
    a.output.parent.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='ayo-gtfs-candidate-',dir=a.output.parent));source=a.zip
    if source is None:
        url='https://kamino.mcts.org/gtfs/google_transit.zip'
        from urllib.parse import urlsplit
        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,req,fp,code,msg,headers,newurl):
                target=urlsplit(newurl)
                if target.scheme!='https' or target.hostname not in {'kamino.mcts.org','www.ridemcts.com'}:raise ValueError('Unapproved GTFS redirect')
                return super().redirect_request(req,fp,code,msg,headers,newurl)
        source=work/'download.zip';count=0
        with urllib.request.build_opener(Redirect,urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where()))).open(url,timeout=20) as response,source.open('xb') as out:
            while chunk:=response.read(65536):
                count+=len(chunk)
                if count>64*1024*1024:raise ValueError('GTFS download exceeds limit')
                out.write(chunk)
    data=work/'gtfs';data.mkdir();unpack(source,data)
    index=work/'schedule.sqlite';engine=Schedule(data,index);engine.build()
    env={**os.environ,'GTFS_DIR':str(data.resolve()),'SCHEDULE_DB':str(index.resolve())}
    root=Path(__file__).resolve().parents[1]
    subprocess.run([sys.executable,str(root/'scripts/audit_gtfs.py'),str(work/'integrity.json')],env=env,check=True)
    if not engine.services(datetime.now(TZ).date()):raise ValueError('Candidate does not cover today; not eligible for activation')
    manifest={'staged_at':datetime.now(timezone.utc).isoformat(),'source':'operator-provided archive' if a.zip else 'https://kamino.mcts.org/gtfs/google_transit.zip','archive_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(data.glob('*.txt'))}}
    (work/'provenance.json').write_text(json.dumps(manifest,indent=2));work.rename(a.output)
    print('Validated candidate staged at',a.output.resolve(),'; no active schedule or service was changed.')
if __name__=='__main__':main()
