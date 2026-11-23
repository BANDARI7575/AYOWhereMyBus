"""Probe a private/approved deployment. Does not send messages or disclose rider data."""
import argparse,json,sys,time,urllib.request,urllib.error,ssl,os
import certifi
from urllib.parse import urlsplit
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url',required=True);p.add_argument('--allow-local-http',action='store_true');a=p.parse_args();u=urlsplit(a.url)
if u.username or u.password or u.query or u.fragment or u.path not in ('','/') or (u.scheme!='https' and not(a.allow_local_http and u.scheme=='http' and u.hostname in ['localhost','127.0.0.1','::1'])):p.error('Use approved HTTPS origin or explicit local HTTP')
r={};ok=True
for path in ['/api/health','/api/ready','/api/status','/api/service-alerts','/api/buses']:
    start=time.monotonic()
    try:
        with urllib.request.urlopen(a.url.rstrip('/')+path,timeout=15,context=ssl.create_default_context(cafile=os.getenv('SSL_CERT_FILE') or certifi.where())) as response:data=json.load(response)
        fresh=path!='/api/buses' or data.get('feed_fresh') is True
        if path=='/api/service-alerts':fresh=data.get('status')=='fresh'
        r[path]={'ok':fresh,'seconds':round(time.monotonic()-start,3)};ok=ok and fresh
    except (OSError,ValueError) as error:r[path]={'ok':False,'error':type(error).__name__};ok=False
print(json.dumps({'ok':ok,'checks':r},indent=2));sys.exit(0 if ok else 1)
