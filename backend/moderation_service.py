"""Operator review and anonymous abuse workflow. No moderator secret reaches a page."""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from flask import g, jsonify, request

REASONS={'spam','personal_info','unsafe','incorrect','other'}

def moderator_identity():
    tokens={}
    raw=os.getenv('MODERATOR_TOKENS','')
    if raw:
        try: tokens=json.loads(raw)
        except ValueError: return None
    if not raw and os.getenv('MODERATOR_TOKEN'):
        tokens[os.getenv('MODERATOR_NAME','operator')]=os.environ['MODERATOR_TOKEN']
    supplied=request.headers.get('Authorization','').encode()
    if not isinstance(tokens,dict): return None
    for name, token in tokens.items():
        if isinstance(name,str) and re.fullmatch('[A-Za-z0-9_-]{1,40}',name) and isinstance(token,str) and token:
            if hmac.compare_digest(supplied,('Bearer '+token).encode()): return name
    return None

def install_admin(app,db,privacy_key):
    @app.get('/api/moderation/queue')
    def review_queue():
        actor=moderator_identity()
        if not actor:return jsonify(message='Unauthorized'),401
        state=request.args.get('state','pending')
        if state not in {'pending','held','approved','rejected','flagged'}:raise ValueError('Invalid review state')
        try: after=int(request.args.get('after','0'))
        except ValueError: raise ValueError('Invalid cursor')
        with db() as c:
            predicate="EXISTS(SELECT 1 FROM report_flags f WHERE f.report_id=r.id)" if state=='flagged' else 'r.state=?'
            params=[after]+([] if state=='flagged' else [state])
            rows=c.execute('SELECT r.*, (SELECT COUNT(*) FROM report_flags f WHERE f.report_id=r.id) AS flags FROM reports r WHERE r.id>? AND '+predicate+' ORDER BY r.id LIMIT 50',params).fetchall()
        return jsonify(reports=[dict(r) for r in rows],next_cursor=rows[-1]['id'] if len(rows)==50 else None,reviewer=actor)
    @app.get('/api/moderation/summary')
    def summary():
        if not moderator_identity():return jsonify(message='Unauthorized'),401
        now=int(time.time())
        with db() as c:
            counts={r[0]:r[1] for r in c.execute('SELECT state,COUNT(*) FROM reports WHERE expires>? GROUP BY state',(now,))}
            oldest=c.execute("SELECT MIN(created) FROM reports WHERE state IN ('pending','held') AND expires>?",(now,)).fetchone()[0]
            flags=c.execute('SELECT COUNT(*) FROM report_flags').fetchone()[0]
            worker={r[0]:r[1] for r in c.execute('SELECT name,heartbeat FROM worker_status')}
        return jsonify(active_by_state=counts,oldest_wait_seconds=max(0,now-oldest) if oldest else 0,flags=flags,worker=worker)
    @app.get('/api/moderation/audit')
    def audit():
        if not moderator_identity():return jsonify(message='Unauthorized'),401
        with db() as c: rows=c.execute('SELECT report_id,state,at,actor,reason FROM moderation_audit ORDER BY at DESC,rowid DESC LIMIT 100').fetchall()
        return jsonify(actions=[dict(r) for r in rows])
    @app.post('/api/winter/reports/<int:report_id>/flag')
    def flag(report_id):
        reason=(request.get_json(silent=True) or {}).get('reason')
        if not isinstance(reason,str) or reason not in REASONS:raise ValueError('Choose a valid abuse reason')
        # Per-peer deduplication prevents clearing cookies from multiplying flags.
        identity=hmac.new(privacy_key,(str(int(time.time()//86400))+':'+(request.remote_addr or '')).encode(),hashlib.sha256).hexdigest()
        with db() as c:
            if not c.execute("SELECT 1 FROM reports WHERE id=? AND state='approved' AND expires>?",(report_id,time.time())).fetchone():return jsonify(message='Report unavailable'),404
            c.execute('INSERT INTO report_flags VALUES(?,?,?,?) ON CONFLICT(report_id,identity) DO UPDATE SET reason=excluded.reason',(report_id,identity,reason,int(time.time())))
            count=c.execute('SELECT COUNT(*) FROM report_flags WHERE report_id=?',(report_id,)).fetchone()[0]
            if count>=3:
                c.execute("UPDATE reports SET state='held' WHERE id=?",(report_id,))
                c.execute("INSERT INTO moderation_audit(report_id,state,at,actor,reason) VALUES(?,'held',?,'system','abuse_threshold')",(report_id,int(time.time())))
        return jsonify(status='queued_for_review')
