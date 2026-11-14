"""Integrated rider APIs, persistent moderation and bounded request budgets."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
import threading
import copy
from pathlib import Path
from backend.paths import PROJECT_ROOT
from backend.alert_service import snapshot as alert_snapshot
from flask import request, jsonify
from backend.transit_engine import Schedule, TZ, ClosingConnection
from backend.realtime_service import Realtime
from datetime import datetime, timezone

schedule=Schedule(); realtime=Realtime()
DB=os.getenv('COMMUNITY_DB',str(PROJECT_ROOT/'instance/community.sqlite'))
_privacy_key = os.getenv('PRIVACY_KEY', '').encode() or secrets.token_bytes(32)
_journey_slots = threading.BoundedSemaphore(2)
_journey_cache={}
_journey_cache_lock=threading.Lock()
_db_lock=threading.Lock()
_db_initialized=set()

def authorized_moderator():
    from backend.moderation_service import moderator_identity
    return moderator_identity() is not None

def db():
    Path(DB).parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    c=sqlite3.connect(DB,timeout=10,factory=ClosingConnection); c.row_factory=sqlite3.Row
    os.chmod(DB, 0o600)
    with _db_lock:
        inode=Path(DB).stat().st_ino
        if (DB,inode) not in _db_initialized:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('BEGIN IMMEDIATE')
            schema="""CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,stop_id TEXT,text TEXT,state TEXT DEFAULT 'pending',created INTEGER,expires INTEGER);
            CREATE TABLE IF NOT EXISTS votes(report_id INTEGER,voter TEXT,value INTEGER,PRIMARY KEY(report_id,voter));
            CREATE TABLE IF NOT EXISTS limits(identity TEXT,bucket INTEGER,kind TEXT,count INTEGER,PRIMARY KEY(identity,bucket,kind));
            CREATE TABLE IF NOT EXISTS moderation_audit(report_id INTEGER,state TEXT,at INTEGER);
            CREATE TABLE IF NOT EXISTS report_flags(report_id INTEGER,identity TEXT,reason TEXT,created INTEGER,PRIMARY KEY(report_id,identity));
            CREATE TABLE IF NOT EXISTS push_watches(id INTEGER PRIMARY KEY,target TEXT UNIQUE,owner TEXT,payload TEXT,created INTEGER,expires INTEGER);
            CREATE TABLE IF NOT EXISTS push_deliveries(watch_id INTEGER,trip_key TEXT,attempted INTEGER,attempts INTEGER,state TEXT,PRIMARY KEY(watch_id,trip_key));
            CREATE TABLE IF NOT EXISTS worker_status(name TEXT PRIMARY KEY,heartbeat INTEGER);
            CREATE INDEX IF NOT EXISTS reports_review ON reports(state,id);
            CREATE INDEX IF NOT EXISTS reports_expiry ON reports(expires);"""
            for statement in schema.split(';'):
                if statement.strip():c.execute(statement)
            fields={r[1] for r in c.execute('PRAGMA table_info(moderation_audit)')}
            for name in ['actor','reason']:
                if name not in fields:c.execute('ALTER TABLE moderation_audit ADD COLUMN '+name+" TEXT DEFAULT ''")
            c.commit();_db_initialized.add((DB,inode))
    c.execute('PRAGMA foreign_keys=ON')
    return c

def install(app):
    production=os.getenv('AYO_ENV')=='production'
    if production:
        for name in (['PRIVACY_KEY'] if os.getenv('MODERATOR_TOKENS') else ['MODERATOR_TOKEN','PRIVACY_KEY']):
            if len(os.getenv(name,''))<32 or 'replace-with' in os.getenv(name,''):
                raise RuntimeError(name+' must be a production secret of at least 32 characters')
        app.config['TRUSTED_HOSTS'] = [h.strip() for h in os.environ['ALLOWED_HOSTS'].split(',') if h.strip()]
        if not app.config['TRUSTED_HOSTS']: raise RuntimeError('ALLOWED_HOSTS must not be empty')
    if os.getenv('MODERATOR_TOKENS'):
        import json,re
        tokens=json.loads(os.environ['MODERATOR_TOKENS'])
        if not isinstance(tokens,dict) or not tokens or any(not re.fullmatch('[A-Za-z0-9_-]{1,40}',n) or not isinstance(v,str) or len(v)<32 for n,v in tokens.items()):raise RuntimeError('Invalid named moderator credentials')
    if production:
        import re
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',os.getenv('SUPPORT_EMAIL','')):raise RuntimeError('SUPPORT_EMAIL must be the real public operator contact')
        if os.getenv('RETENTION_APPROVED')!='1':raise RuntimeError('Approve the retention policy and set RETENTION_APPROVED=1')
        from backend.push_service import validate_configuration
        validate_configuration()
        from cryptography.fernet import Fernet
        Fernet(os.environ['BACKUP_ENCRYPTION_KEY'].encode())
    app.config['AYO_PRODUCTION']=production
    hops=int(os.getenv('PROXY_HOPS','0'))
    if hops not in (0,1): raise RuntimeError('PROXY_HOPS must be 0 or 1')
    if hops:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app=ProxyFix(app.wsgi_app,x_for=1,x_proto=1,x_host=0,x_port=0,x_prefix=0)
    # Captured once per process, so health checks distinguish a running old
    # backend from static files that Flask reads fresh on every request.
    app.config['AYO_STARTED_AT'] = datetime.now(timezone.utc).isoformat()
    app.config['AYO_PLANNER_API_VERSION'] = 1
    root = PROJECT_ROOT
    revision=hashlib.sha256()
    inputs=list(root.glob('*.py'))+list((root/'backend').rglob('*.py'))+[root/'index.html',root/'requirements.lock']+list((root/'static').rglob('*'))
    for path in sorted(p for p in inputs if p.is_file() and '.backup.' not in p.name and p.name!='.DS_Store'):
        revision.update(str(path.relative_to(root)).encode()+b'\0'+hashlib.sha256(path.read_bytes()).digest())
    app.config['AYO_SOURCE_REVISION']=revision.hexdigest()[:12]
    app.config['MAX_CONTENT_LENGTH']=4096
    @app.before_request
    def protect():
        if not request.path.startswith('/api/'): return
        if request.path in ['/api/health','/api/ready']: return
        if production and not request.is_secure: return jsonify(message='HTTPS is required'),400
        if request.method=='POST' and not isinstance(request.get_json(silent=True),dict): return jsonify(message='Expected a JSON object'),400
        if request.method=='POST' and (request.headers.get('Sec-Fetch-Site')=='cross-site' or (request.headers.get('Origin') and request.headers['Origin'].rstrip('/')!=request.host_url.rstrip('/'))):
            return jsonify(message='Cross-origin writes are blocked'),403
        kind='write' if request.method=='POST' else 'read'; bucket=int(time.time()//60)
        identity=hmac.new(_privacy_key,(str(bucket//1440)+':'+(request.remote_addr or '')).encode(),hashlib.sha256).hexdigest()
        with db() as c:
            c.execute("DELETE FROM limits WHERE (kind IN ('read','write','journey') AND bucket<?) OR (kind IN ('report','vote','flag','push') AND bucket<?)",(bucket-2,bucket//60-2))
            c.execute('INSERT INTO limits VALUES(?,?,?,1) ON CONFLICT(identity,bucket,kind) DO UPDATE SET count=count+1',(identity,bucket,kind))
            count=c.execute('SELECT count FROM limits WHERE identity=? AND bucket=? AND kind=?',(identity,bucket,kind)).fetchone()[0]
        if count>(12 if kind=='write' else 120): return jsonify(message='Too many requests. Try again shortly.'),429,{'Retry-After':'60'}
        limited_kind = 'journey' if (request.path=='/api/journeys' or request.path=='/api/agent/tools' and (request.get_json(silent=True) or {}).get('name')=='plan_journey') else 'report' if request.path=='/api/winter/reports' and request.method=='POST' else 'vote' if request.path.endswith('/vote') and request.method=='POST' else 'flag' if request.path.endswith('/flag') and request.method=='POST' else 'push' if request.path=='/api/push/subscribe' and request.method=='POST' else None
        if limited_kind:
            span=60 if limited_kind=='journey' else 3600
            slot=int(time.time()//span); maximum={'journey':8,'report':3,'vote':30,'flag':4,'push':6}[limited_kind]
            with db() as c:
                c.execute('INSERT INTO limits VALUES(?,?,?,1) ON CONFLICT(identity,bucket,kind) DO UPDATE SET count=count+1',(identity,slot,limited_kind))
                amount=c.execute('SELECT count FROM limits WHERE identity=? AND bucket=? AND kind=?',(identity,slot,limited_kind)).fetchone()[0]
            if amount>maximum: return jsonify(message='Search or submission limit reached. Try again later.'),429,{'Retry-After':str(span)}
    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Referrer-Policy']='strict-origin-when-cross-origin'
        response.headers['Permissions-Policy']='geolocation=(self), microphone=(self), camera=()'
        response.headers['X-Frame-Options']='DENY'
        response.headers['X-AYO-Revision'] = app.config['AYO_SOURCE_REVISION']
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self' https://api.open-meteo.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        if request.is_secure: response.headers['Strict-Transport-Security']='max-age=31536000'
        if request.path.startswith('/api/'): response.headers['Cache-Control']='no-store'
        return response
    @app.errorhandler(ValueError)
    def invalid(error): return jsonify(message=str(error)),400
    @app.errorhandler(OSError)
    @app.errorhandler(sqlite3.OperationalError)
    def unavailable(error):
        app.logger.error('Database unavailable: %s',error)
        return jsonify(message='Transit data is temporarily unavailable. Please try again later.'),503
    @app.get('/api/ready')
    def ready():
        try:
            with schedule.connect() as c:
                tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'stops','stop_times','trips','routes','calendar_dates','transfers','frequencies'}<=tables:
                    raise ValueError('Incomplete schedule index')
            active=bool(schedule.services(datetime.now(TZ).date()))
            with db() as c: c.execute('SELECT 1 FROM reports LIMIT 1').fetchall()
            with db() as c:worker=c.execute("SELECT heartbeat FROM worker_status WHERE name='push'").fetchone()
            worker_ok=bool(worker and -60<=time.time()-worker[0]<=90)
            ok=active and (not production or worker_ok)
            return jsonify(background_worker_healthy=worker_ok,status='ready' if ok else 'not_ready',schedule_active_today=active,
                           moderation_configured=bool(os.getenv('MODERATOR_TOKEN') or os.getenv('MODERATOR_TOKENS')),source_revision=app.config['AYO_SOURCE_REVISION']),200 if ok else 503
        except (sqlite3.Error,OSError,ValueError):
            return jsonify(status='not_ready',message='Schedule or persistent storage unavailable'),503
    @app.get('/api/stops/search')
    def search():
        q=request.args.get('q','').strip()
        if not 2<=len(q)<=80: raise ValueError('Enter 2–80 characters')
        return jsonify(stops=schedule.stops(q))
    @app.get('/api/stops/<stop_id>/departures')
    def departures(stop_id):
        if not stop_id.isdigit() or len(stop_id)>12: raise ValueError('Invalid stop ID')
        rows,status=realtime.apply(schedule.departures(stop_id))
        return jsonify(departures=rows[:30],realtime_status=status,timezone=str(TZ),message='Scheduled times are not predictions. No departures may mean no covered service.')
    @app.get('/api/routes/<route>/shape')
    def shape(route):
        if len(route)>20 or not all(x.isalnum() or x in '-_' for x in route): raise ValueError('Invalid route')
        return jsonify(shapes=schedule.shape(route))
    @app.get('/api/journeys')
    def journeys():
        origin,destination=request.args.get('from',''),request.args.get('to','')
        walking=request.args.get('walking','0')
        if walking not in ('0','1'):raise ValueError('Choose whether to include estimated walking connections')
        if not origin or not destination or len(origin)>128 or len(destination)>128:raise ValueError('Choose an origin and destination from the suggestions')
        try:choice=int(request.args.get('choice','0'))
        except ValueError:raise ValueError('Invalid journey choice')
        if not 0<=choice<=2:raise ValueError('Invalid journey choice')
        depart_at=request.args.get('depart_at','')
        departure=None
        if depart_at:
            try:departure=datetime.fromisoformat(depart_at)
            except ValueError:raise ValueError('Invalid departure time')
            if departure.tzinfo is None or not 0<=departure.timestamp()-time.time()<=31*86400:raise ValueError('Choose a timezone-aware departure within the next 31 days')
        stamp=Path(schedule.database).stat()
        key=(schedule.database,stamp.st_ino,stamp.st_mtime_ns,origin,destination,walking,depart_at,choice)
        with _journey_cache_lock:
            cached=_journey_cache.get(key)
            if cached and time.monotonic()-cached[0]<20 and (cached[1].get('valid_until') is None or cached[1]['valid_until']>time.time()):
                return jsonify(copy.deepcopy(cached[1]))
        if not _journey_slots.acquire(blocking=False): return jsonify(message='Journey planner is busy. Try again shortly.'),503,{'Retry-After':'3'}
        try:
            options={'allow_walks':walking=='1'}
            if choice:options['choice']=choice
            if departure:options['now']=departure
            result=schedule.itinerary(origin,destination,**options)
            if departure:
                result['requested_departure_at']=int(departure.timestamp())
                result['requested_at']=int(time.time())
                if result.get('legs'):result['valid_until']=min(result['departure'],int(time.time())+300)
            with _journey_cache_lock:
                if len(_journey_cache)>=32:_journey_cache.pop(next(iter(_journey_cache)))
                _journey_cache[key]=(time.monotonic(),copy.deepcopy(result))
            return jsonify(result)
        finally:_journey_slots.release()
    @app.get('/api/journey-locations')
    def journey_locations():
        if 'lat' in request.args or 'lon' in request.args:
            try:
                latitude = float(request.args['lat'])
                longitude = float(request.args['lon'])
            except (KeyError, ValueError):
                raise ValueError('Provide valid latitude and longitude')
            locations = schedule.locations(latitude=latitude, longitude=longitude)
        else:
            query = request.args.get('q', '').strip()
            if not 2 <= len(query) <= 80:
                raise ValueError('Enter 2–80 characters of a stop or intersection name')
            locations = schedule.locations(query)
        return jsonify(locations=locations, source='GTFS stops',
                       distance_type='straight_line', radius_meters=1500,
                       address_search_available=False)
    @app.get('/api/service-alerts')
    def alerts(): return jsonify(alert_snapshot(realtime,schedule))
    @app.get('/api/status')
    def status():
        with schedule.connect() as c:
            coverage=c.execute('SELECT MIN(date),MAX(date) FROM calendar_dates').fetchone()
        return jsonify(schedule_start=coverage[0],schedule_end=coverage[1],schedule_active_today=bool(schedule.services(datetime.now(TZ).date())),timezone=str(TZ),moderation_configured=bool(os.getenv('MODERATOR_TOKEN') or os.getenv('MODERATOR_TOKENS')),support_email=os.getenv('SUPPORT_EMAIL') or None)
    @app.get('/api/winter/reports')
    def reports():
        with db() as c:
            rows=c.execute("SELECT r.id,r.stop_id,r.text,r.created,r.expires,COALESCE(SUM(v.value),0) AS votes FROM reports r LEFT JOIN votes v ON r.id=v.report_id WHERE r.state='approved' AND r.expires>? GROUP BY r.id ORDER BY r.created DESC LIMIT 100",(int(time.time()),)).fetchall()
        return jsonify(reports=[dict(r) for r in rows],source='Anonymous community reports; unverified')
    @app.post('/api/winter/reports')
    def report():
        data=request.get_json(silent=True) or {}; stop=str(data.get('stop_id','')); text=data.get('text','')
        if not isinstance(text,str) or not 10<=len(text.strip())<=500 or '<' in text or '>' in text or 'http' in text.lower(): raise ValueError('Use 10–500 characters of plain text, without links or personal information')
        with schedule.connect() as c:
            if not c.execute('SELECT 1 FROM stops WHERE stop_id=?',(stop,)).fetchone(): raise ValueError('Choose a valid stop')
        with db() as c:
            duplicate=c.execute("SELECT 1 FROM reports WHERE stop_id=? AND LOWER(TRIM(text))=LOWER(TRIM(?)) AND expires>?",(stop,text.strip(),time.time())).fetchone()
            if duplicate:return jsonify(message='This observation was already submitted. Please do not repeat it.'),409
            cur=c.execute('INSERT INTO reports(stop_id,text,created,expires) VALUES(?,?,?,?)',(stop,text.strip(),int(time.time()),int(time.time())+86400))
        return jsonify(id=cur.lastrowid,state='pending',message='Queued for moderation; expires in 24 hours'),202
    @app.post('/api/winter/reports/<int:report_id>/vote')
    def vote(report_id):
        data=request.get_json(silent=True) or {}; value=data.get('value')
        if type(value)!=int or value not in [-1,1]: raise ValueError('Vote must be -1 or 1')
        voter=request.cookies.get('ayo_voter','')
        if len(voter)!=64: voter=secrets.token_hex(32)
        with db() as c:
            if not c.execute("SELECT 1 FROM reports WHERE id=? AND state='approved' AND expires>?",(report_id,time.time())).fetchone(): return jsonify(message='Report unavailable'),404
            c.execute('INSERT INTO votes VALUES(?,?,?) ON CONFLICT(report_id,voter) DO UPDATE SET value=excluded.value',(report_id,hashlib.sha256(voter.encode()).hexdigest(),value))
        response=jsonify(status='ok'); response.set_cookie('ayo_voter',voter,max_age=2592000,httponly=True,samesite='Strict',secure=request.is_secure); return response
    @app.post('/api/moderation/reports/<int:report_id>')
    def moderate(report_id):
        if not authorized_moderator(): return jsonify(message='Unauthorized'),401
        data=request.get_json(silent=True) or {}
        state=data.get('state')
        reason=data.get('reason','reviewed')
        if not isinstance(reason,str) or reason not in {'reviewed','spam','personal_info','unsafe','incorrect','other','resolved'}:raise ValueError('Invalid moderation reason')
        if state not in ['approved','rejected']: raise ValueError('Invalid state')
        with db() as c:
            n=c.execute('UPDATE reports SET state=? WHERE id=? AND (expires>? OR ?=\'rejected\')',(state,report_id,time.time(),state)).rowcount
            if n:
                c.execute('DELETE FROM report_flags WHERE report_id=?',(report_id,))
                from backend.moderation_service import moderator_identity
                c.execute('INSERT INTO moderation_audit(report_id,state,at,actor,reason) VALUES(?,?,?,?,?)',(report_id,state,int(time.time()),moderator_identity(),reason))
        return jsonify(updated=n)
    @app.get('/api/moderation/reports')
    def queue():
        if not authorized_moderator(): return jsonify(message='Unauthorized'),401
        with db() as c: rows=c.execute("SELECT * FROM reports WHERE state='pending' AND expires>? ORDER BY created LIMIT 100",(time.time(),)).fetchall()
        return jsonify(reports=[dict(r) for r in rows])
    from backend.feature_service import install_features
    install_features(app,lambda:schedule,realtime,db,_journey_slots)
    from backend.push_service import install_push
    install_push(app,db,lambda:schedule)
    from backend.moderation_service import install_admin
    install_admin(app,db,_privacy_key)
    @app.get('/sw.js')
    def worker(): return app.send_static_file('sw.js'),200,{'Cache-Control':'no-cache','Service-Worker-Allowed':'/'}
