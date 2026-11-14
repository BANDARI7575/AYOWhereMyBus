"""Local development server; optional private-LAN TLS, never an interactive debugger."""
import argparse
import ipaddress
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.app import app

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=5001)
    parser.add_argument('--host',default='127.0.0.1',help='Explicit private/loopback IP; LAN requires --https')
    parser.add_argument('--https',action='store_true')
    parser.add_argument('--tls-dir',type=Path,default=ROOT/'instance/dev-tls')
    args=parser.parse_args()
    try:address=ipaddress.ip_address(args.host)
    except ValueError:parser.error('Specify an explicit private IP.')
    if address.is_unspecified or not address.is_private or address.is_multicast:parser.error('Public/wildcard binding is not supported.')
    if not address.is_loopback and not args.https:parser.error('LAN testing requires --https with a trusted certificate.')
    context=None
    if args.https:
        cert,key=args.tls_dir/'server.crt',args.tls_dir/'server.key'
        if not cert.is_file() or not key.is_file():parser.error('Prepare certificates first; see docs/IPHONE_TESTING.md.')
        context=(str(cert),str(key))
    # Keep operator/debug surfaces off the optional device-testing listener.
    if not address.is_loopback:
        from werkzeug.wrappers import Response
        original=app.wsgi_app
        def private_surface(environ,start_response):
            path=environ.get('PATH_INFO','')
            if path.startswith('/api/moderation') or path=='/api/ready':return Response('Not found',status=404)(environ,start_response)
            return original(environ,start_response)
        app.wsgi_app=private_surface
    print(f"AYO development: {'https' if context else 'http'}://{args.host}:{args.port}/",flush=True)
    app.run(host=args.host,port=args.port,debug=False,use_reloader=False,ssl_context=context)
