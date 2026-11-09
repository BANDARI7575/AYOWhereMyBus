"""Secure operator console. Secrets are prompted, never accepted in command arguments."""
import argparse
import getpass
import json
import os
import sys
import ssl
import certifi
import urllib.request
import urllib.error
from urllib.parse import urlsplit,urlencode

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url',required=True,help='Approved HTTPS origin')
    p.add_argument('--allow-local-http',action='store_true')
    sub=p.add_subparsers(dest='command',required=True)
    q=sub.add_parser('queue');q.add_argument('--state',choices=['pending','held','approved','rejected','flagged'],default='pending');q.add_argument('--after',type=int,default=0)
    r=sub.add_parser('review');r.add_argument('id',type=int);r.add_argument('state',choices=['approved','rejected']);r.add_argument('--reason',choices=['reviewed','spam','personal_info','unsafe','incorrect','other','resolved'],required=True)
    sub.add_parser('summary');sub.add_parser('audit')
    a=p.parse_args();origin=urlsplit(a.url)
    local=origin.hostname in ['127.0.0.1','localhost','::1']
    if origin.username or origin.password or origin.query or origin.fragment or origin.path not in ('','/') or (origin.scheme!='https' and not (a.allow_local_http and local and origin.scheme=='http')):p.error('Use a credential-free HTTPS origin; HTTP is permitted only with --allow-local-http on loopback')
    token=os.getenv('AYO_ADMIN_TOKEN') or getpass.getpass('Moderator token: ')
    body=None
    if a.command=='queue':path='/api/moderation/queue?'+urlencode({'state':a.state,'after':a.after})
    elif a.command=='review':path=f'/api/moderation/reports/{a.id}';body=json.dumps({'state':a.state,'reason':a.reason}).encode()
    else:path='/api/moderation/'+a.command
    request=urllib.request.Request(a.url.rstrip('/')+path,data=body,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
    # Never forward credentials through an unexpected redirect.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):return None
    try:
        with urllib.request.build_opener(NoRedirect,urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=os.getenv('SSL_CERT_FILE') or certifi.where()))).open(request,timeout=15) as response:print(json.dumps(json.load(response),ensure_ascii=True,indent=2))
    except urllib.error.HTTPError as error:
        print('Operator request failed with HTTP '+str(error.code),file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
