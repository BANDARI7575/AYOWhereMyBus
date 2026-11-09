"""Opt-in background arrival watches; encrypted subscriptions and verified GTFS-RT only."""
import base64
import hashlib
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit
from flask import jsonify,request

PROVIDERS={'fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'}

def b64decode(value):
    if not isinstance(value,str) or not re.fullmatch('[A-Za-z0-9_-]+={0,2}',value):raise ValueError('Invalid push key')
    return base64.urlsafe_b64decode(value+'='*((-len(value))%4))

def validate_subscription(sub):
    if not isinstance(sub,dict):raise ValueError('Invalid push subscription')
    endpoint=sub.get('endpoint','')
    if not isinstance(endpoint,str) or len(endpoint)>2048:raise ValueError('Invalid push endpoint')
    p=urlsplit(endpoint)
    if p.scheme!='https' or p.username or p.password or p.port not in (None,443) or p.fragment or (p.hostname not in PROVIDERS and not (p.hostname or '').endswith('.notify.windows.com')):raise ValueError('Unsupported push provider')
    keys=sub.get('keys',{})
    if not isinstance(keys,dict) or len(b64decode(keys.get('p256dh')))!=65 or len(b64decode(keys.get('auth')))!=16:raise ValueError('Invalid push keys')
    from cryptography.hazmat.primitives.asymmetric import ec
    ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),b64decode(keys['p256dh']))
    return {'endpoint':endpoint,'keys':{'p256dh':keys['p256dh'],'auth':keys['auth']}}

def configuration():
    return all(os.getenv(n) for n in ['VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY','VAPID_SUBJECT','PUSH_ENCRYPTION_KEY'])

def validate_configuration():
    if not configuration():raise RuntimeError('Background push credentials are not configured')
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    Fernet(os.environ['PUSH_ENCRYPTION_KEY'].encode())
    path=Path(os.environ['VAPID_PRIVATE_KEY'])
    if path.stat().st_mode&0o077:raise RuntimeError('VAPID private key permissions must be 0600')
    key=serialization.load_pem_private_key(path.read_bytes(),password=None)
    if not isinstance(key,ec.EllipticCurvePrivateKey) or not isinstance(key.curve,ec.SECP256R1):raise RuntimeError('VAPID requires P-256')
    public=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    if public!=b64decode(os.environ['VAPID_PUBLIC_KEY']):raise RuntimeError('VAPID public/private keys do not match')
    if not re.fullmatch(r'mailto:[^\s@]+@[^\s@]+\.[^\s@]+',os.environ['VAPID_SUBJECT']):raise RuntimeError('Set VAPID_SUBJECT to the real operator mailto contact')

def cipher():
    from cryptography.fernet import Fernet
    return Fernet(os.environ['PUSH_ENCRYPTION_KEY'].encode())

def owner(value):
    return hashlib.sha256(value.encode()).hexdigest()

def install_push(app,db,get_schedule):
    def worker_healthy():
        with db() as c:row=c.execute("SELECT heartbeat FROM worker_status WHERE name='push'").fetchone()
        return bool(row and -60<=time.time()-row['heartbeat']<=90)
    @app.get('/api/push/config')
    def config():
        # No private key or provider endpoint is returned here.
        return jsonify(configured=bool(configuration()),available=bool(configuration()) and worker_healthy(),public_key=os.getenv('VAPID_PUBLIC_KEY') if configuration() else None)
    @app.post('/api/push/subscribe')
    def subscribe():
        if not configuration():return jsonify(message='Background alerts require operator setup'),503
        if not worker_healthy():return jsonify(message='Background alert worker is unavailable. Try again later.'),503
        data=request.get_json(silent=True) or {};sid=data.get('stop_id');language=data.get('language','en')
        if not isinstance(sid,str) or len(sid)>128 or language not in ('en','es') or data.get('consent') is not True:raise ValueError('Choose a valid stop and explicitly allow notifications')
        with get_schedule().connect() as c:
            stop=c.execute('SELECT stop_name FROM stops WHERE stop_id=?',(sid,)).fetchone()
            if not stop:raise ValueError('Choose a valid stop')
        sub=validate_subscription(data.get('subscription'))
        value=request.cookies.get('ayo_push_owner','')
        if not re.fullmatch('[a-f0-9]{64}',value):value=secrets.token_hex(32)
        identity=owner(value);target=hashlib.sha256((sub['endpoint']+'|'+sid).encode()).hexdigest();now=int(time.time())
        payload=cipher().encrypt(json.dumps({'stop_id':sid,'stop_name':stop['stop_name'],'language':language,'subscription':sub}).encode()).decode()
        with db() as c:
            c.execute('DELETE FROM push_deliveries WHERE watch_id IN (SELECT id FROM push_watches WHERE expires<=?)',(now,))
            c.execute('DELETE FROM push_watches WHERE expires<=?',(now,))
            existing=c.execute('SELECT owner FROM push_watches WHERE target=?',(target,)).fetchone()
            if existing and existing['owner']!=identity:return jsonify(message='Subscription ownership changed. Unsubscribe in your browser and try again.'),409
            count=c.execute('SELECT COUNT(*) FROM push_watches WHERE owner=? AND expires>?',(identity,now)).fetchone()[0]
            total=c.execute('SELECT COUNT(*) FROM push_watches WHERE expires>?',(now,)).fetchone()[0]
            if total>=200 and not existing:return jsonify(message='Background alert capacity reached. Try again later.'),503
            if count>=3 and not existing:return jsonify(message='Up to three background watches are allowed'),429
            c.execute('INSERT INTO push_watches(target,owner,payload,created,expires) VALUES(?,?,?,?,?) ON CONFLICT(target) DO UPDATE SET owner=excluded.owner,payload=excluded.payload,expires=excluded.expires',(target,identity,payload,now,now+86400))
        r=jsonify(status='subscribed',expires=now+86400);r.set_cookie('ayo_push_owner',value,max_age=30*86400,secure=request.is_secure,httponly=True,samesite='Strict');return r
    @app.post('/api/push/unsubscribe')
    def unsubscribe():
        with db() as c:
            c.execute('DELETE FROM push_deliveries WHERE watch_id IN (SELECT id FROM push_watches WHERE owner=?)',(owner(request.cookies.get('ayo_push_owner','')),))
            c.execute('DELETE FROM push_watches WHERE owner=?',(owner(request.cookies.get('ayo_push_owner','')),))
        return jsonify(status='unsubscribed')

def reliable_prediction(dep,now):
    return (not dep.get('canceled') and dep.get('data_type')=='realtime' and dep.get('prediction_at') is not None
            and -60<=now-dep.get('prediction_reported_at',0)<=180 and 0<dep['prediction_at']-now<=300 and (dep.get('uncertainty_seconds') is None or dep['uncertainty_seconds']<=120))

def send(subscription,payload):
    import requests
    from pywebpush import webpush
    class SafeSession(requests.Session):
        def post(self,url,**kwargs):
            validate_subscription({**subscription,'endpoint':url})
            kwargs['allow_redirects']=False
            return super().post(url,**kwargs)
    with SafeSession() as session:
        return webpush(subscription_info=subscription,data=json.dumps(payload),vapid_private_key=os.environ['VAPID_PRIVATE_KEY'],
                       vapid_claims={'sub':os.environ['VAPID_SUBJECT']},ttl=30,timeout=5,requests_session=session)

def tick(db,schedule,realtime,sender=send,now=None):
    clock=(lambda:int(now)) if now is not None else (lambda:int(time.time()))
    now=clock();sent=0;failures=0;departures={};started=time.monotonic();last_cursor=0
    with db() as c:
        c.execute('DELETE FROM push_deliveries WHERE watch_id IN (SELECT id FROM push_watches WHERE expires<=?)',(now,))
        c.execute('DELETE FROM push_watches WHERE expires<=?',(now,))
        c.execute('DELETE FROM push_deliveries WHERE watch_id NOT IN (SELECT id FROM push_watches)')
        position=c.execute("SELECT heartbeat FROM worker_status WHERE name='push_cursor'").fetchone()
        cursor=position[0] if position else 0
        watches=c.execute('SELECT * FROM push_watches ORDER BY (id<=?),id LIMIT 200',(cursor,)).fetchall()
        c.execute("INSERT INTO worker_status VALUES('push',?) ON CONFLICT(name) DO UPDATE SET heartbeat=excluded.heartbeat",(now,))
    for watch in watches:
        if time.monotonic()-started>20:break
        last_cursor=watch['id']
        try:
            data=json.loads(cipher().decrypt(watch['payload'].encode()));sid=data['stop_id']
            if sid not in departures:departures[sid]=realtime.apply(schedule.departures(sid))[0]
            for dep in departures[sid]:
                current=clock()
                if not reliable_prediction(dep,current):continue
                key=dep['trip_id']+'|'+dep['service_date'];tag=hashlib.sha256((str(watch['id'])+key).encode()).hexdigest()[:24]
                with db() as c:
                    c.execute('INSERT OR IGNORE INTO push_deliveries VALUES(?,?,?,0,\'new\')',(watch['id'],key,0))
                    claimed=c.execute("UPDATE push_deliveries SET attempted=?,attempts=attempts+1,state='sending' WHERE watch_id=? AND trip_key=? AND state IN ('new','failed','sending') AND attempts<2 AND attempted<?",(current,watch['id'],key,current-60)).rowcount
                if not claimed:continue
                es=data['language']=='es';stamp=dep['prediction_at']
                from datetime import datetime
                from transit_engine import TZ
                at=datetime.fromtimestamp(stamp,TZ).strftime('%H:%M')
                route=dep.get('route_number') or dep['route_id']
                body=(f"Ruta {route} · {data.get('stop_name',sid)}: llegada estimada {at}. MCTS; no garantizada." if es else f"Route {route} · {data.get('stop_name',sid)}: predicted arrival {at}. MCTS; not guaranteed.")
                payload={'title':'AYO!','body':body,'language':data['language'],'tag':tag,'expires_at':min(stamp,current+60),'prediction_at':stamp}
                try:
                    sender(data['subscription'],payload)
                except Exception as error:
                    failures+=1
                    response=getattr(error,'response',None);status=getattr(response,'status_code',None)
                    with db() as c:
                        c.execute("UPDATE push_deliveries SET state='failed' WHERE watch_id=? AND trip_key=?",(watch['id'],key))
                        if status in (404,410):c.execute('DELETE FROM push_watches WHERE id=?',(watch['id'],))
                    # Endpoint, keys and error messages are intentionally not logged.
                    continue
                with db() as c:c.execute("UPDATE push_deliveries SET state='sent' WHERE watch_id=? AND trip_key=?",(watch['id'],key))
                sent+=1
                with db() as c:c.execute('UPDATE push_watches SET expires=? WHERE id=?',(current,watch['id']))
                break
            with db() as c:c.execute("UPDATE worker_status SET heartbeat=? WHERE name='push'",(int(time.time()),))
        except Exception:
            failures+=1
            # Invalid encryption/keys are an operational error; never publish content.
            continue
    with db() as c:
        for name,value in [('push_cursor',last_cursor),('push_failures',failures),('push_duration_seconds',round(time.monotonic()-started))]:
            c.execute('INSERT INTO worker_status VALUES(?,?) ON CONFLICT(name) DO UPDATE SET heartbeat=excluded.heartbeat',(name,value))
    return sent
