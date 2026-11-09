"""Full-release operations, abuse, retained data and encrypted push contracts."""
import base64,json,os,tempfile,time
from pathlib import Path
from unittest.mock import patch
import test_release
import release_api
from push_service import validate_subscription,reliable_prediction,tick
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.fernet import Fernet

def subscription():
    key=ec.generate_private_key(ec.SECP256R1())
    encode=lambda data:base64.urlsafe_b64encode(data).decode().rstrip('=')
    return {'endpoint':'https://fcm.googleapis.com/fcm/send/isolated-test-only','keys':{'p256dh':encode(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)),'auth':encode(b'0123456789012345')}}

class OperationsTests(test_release.ApiTests):
    def approved(self):
        with release_api.db() as c:c.execute("INSERT INTO reports(id,stop_id,text,state,created,expires) VALUES(100,'1','Test observation only.','approved',?,?)",(int(time.time()),int(time.time())+3600))
    def test_named_review_reason_and_private_audit(self):
        token='named-reviewer-secret-with-32-plus-characters'
        with patch.dict(os.environ,{'MODERATOR_TOKENS':json.dumps({'reviewer_a':token}),'MODERATOR_TOKEN':''}):
            r=self.client.post('/api/winter/reports',json={'stop_id':'1','text':'Different isolated observation.'})
            headers={'Authorization':'Bearer '+token}
            queue=self.client.get('/api/moderation/queue',headers=headers).json
            self.assertEqual(queue['reviewer'],'reviewer_a');self.assertEqual(len(queue['reports']),1)
            self.assertEqual(self.client.get('/api/moderation/audit').status_code,401)
            self.client.post('/api/moderation/reports/'+str(r.json['id']),json={'state':'rejected','reason':'incorrect'},headers=headers)
            audit=self.client.get('/api/moderation/audit',headers=headers).json['actions'][0]
            self.assertEqual((audit['actor'],audit['reason']),('reviewer_a','incorrect'))
    def test_abuse_threshold_holds_report_and_repeats_do_not_multiply(self):
        self.approved()
        self.assertEqual(self.client.post('/api/winter/reports/100/flag',json={'reason':'spam'}).status_code,200)
        self.client.post('/api/winter/reports/100/flag',json={'reason':'spam'})
        with release_api.db() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM report_flags').fetchone()[0],1)
        for address in ['192.0.2.2','192.0.2.3']:
            self.client.post('/api/winter/reports/100/flag',json={'reason':'personal_info'},environ_overrides={'REMOTE_ADDR':address})
        self.assertEqual(self.client.get('/api/winter/reports').json['reports'],[])
        with release_api.db() as c:self.assertEqual(c.execute('SELECT state FROM reports WHERE id=100').fetchone()[0],'held')
    def test_duplicates_and_unpublished_flags_are_rejected(self):
        data={'stop_id':'1','text':'Same isolated observation.'}
        self.assertEqual(self.client.post('/api/winter/reports',json=data).status_code,202)
        self.assertEqual(self.client.post('/api/winter/reports',json=data).status_code,409)
        self.assertEqual(self.client.post('/api/winter/reports/1/flag',json={'reason':'spam'}).status_code,404)
    def test_push_owned_encryption_cancel_and_one_shot_matching(self):
        env={'PUSH_ENCRYPTION_KEY':Fernet.generate_key().decode(),'VAPID_PUBLIC_KEY':'test-public','VAPID_PRIVATE_KEY':'test-private','VAPID_SUBJECT':'mailto:test@example.invalid'}
        with patch.dict(os.environ,env):
            with release_api.db() as c:c.execute("INSERT INTO worker_status VALUES('push',?)",(int(time.time()),))
            sub=subscription();r=self.client.post('/api/push/subscribe',json={'stop_id':'1','subscription':sub,'language':'es','consent':True})
            self.assertEqual(r.status_code,200)
            with release_api.db() as c:payload=c.execute('SELECT payload FROM push_watches').fetchone()[0]
            self.assertNotIn('fcm.googleapis.com',payload)
            now=int(time.time());dep={'trip_id':'T','service_date':'20261109','route_id':'R','data_type':'realtime','prediction_at':now+120,'prediction_reported_at':now,'uncertainty_seconds':30}
            class Schedule:
                def departures(self,sid):return [dep]
            class RT:
                def apply(self,rows):return rows,'fresh'
            sent=[]
            self.assertEqual(tick(release_api.db,Schedule(),RT(),lambda sub,data:sent.append(data),now),1)
            self.assertEqual(sent[0]['language'],'es');self.assertEqual(tick(release_api.db,Schedule(),RT(),lambda *a:sent.append(a),now+1),0)
            self.assertEqual(self.client.post('/api/push/unsubscribe',json={}).status_code,200)
    def test_push_provider_validation_and_scheduled_suppression(self):
        for endpoint in ['http://fcm.googleapis.com/test','https://127.0.0.1/internal','https://fcm.googleapis.com.evil.example/path','https://fcm.googleapis.com:444/path','https://user:pass@fcm.googleapis.com/x']:
            sub=subscription();sub['endpoint']=endpoint
            with self.assertRaises(ValueError):validate_subscription(sub)
        now=int(time.time())
        self.assertFalse(reliable_prediction({'data_type':'scheduled','prediction_at':now+60},now))
        self.assertFalse(reliable_prediction({'data_type':'realtime','prediction_at':now+60,'prediction_reported_at':now-1000},now))
        self.assertEqual(validate_subscription(subscription())['endpoint'],'https://fcm.googleapis.com/fcm/send/isolated-test-only')

    def test_webpush_encrypts_and_signs_without_sending(self):
        from push_service import send,validate_configuration
        from requests import Response
        import http_ece
        with tempfile.TemporaryDirectory() as folder:
            vapid=ec.generate_private_key(ec.SECP256R1());client=ec.generate_private_key(ec.SECP256R1())
            encode=lambda v:base64.urlsafe_b64encode(v).decode().rstrip('=')
            public=lambda key:key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
            keyfile=Path(folder)/'vapid.pem';keyfile.write_bytes(vapid.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));keyfile.chmod(0o600)
            sub={'endpoint':'https://fcm.googleapis.com/fcm/send/test-only','keys':{'p256dh':encode(public(client)),'auth':encode(b'0123456789012345')}}
            env={'VAPID_PRIVATE_KEY':str(keyfile),'VAPID_PUBLIC_KEY':encode(public(vapid)),'VAPID_SUBJECT':'mailto:qa@example.invalid','PUSH_ENCRYPTION_KEY':Fernet.generate_key().decode()}
            with patch.dict(os.environ,env):
                validate_configuration();response=Response();response.status_code=201;response._content=b''
                with patch('requests.Session.post',return_value=response) as transport:
                    send(sub,{'body':'Isolated crypto contract'})
                options=transport.call_args.kwargs
                self.assertFalse(options['allow_redirects']);self.assertEqual(options['timeout'],5)
                self.assertNotIn(b'Isolated crypto contract',options['data'])
                decoded=http_ece.decrypt(options['data'],private_key=client,auth_secret=b'0123456789012345',version='aes128gcm')
                self.assertEqual(json.loads(decoded)['body'],'Isolated crypto contract')
                self.assertTrue(any(k.lower()=='authorization' for k in options['headers']))

    def test_retention_dry_run_then_apply_only_to_isolated_store(self):
        import subprocess,sys
        with release_api.db() as c:
            c.execute("INSERT INTO reports(id,stop_id,text,state,created,expires) VALUES(200,'1','Expired isolated fixture','rejected',?,?)",(int(time.time())-10*86400,int(time.time())-8*86400))
            c.execute("INSERT INTO report_flags VALUES(200,'isolated','spam',?)",(int(time.time())-8*86400,))
        env={**os.environ,'COMMUNITY_DB':release_api.DB,'AYO_ENV':'development'}
        command=[sys.executable,'scripts/community_storage.py','--purge-expired']
        result=__import__('subprocess').run(command,env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
        with release_api.db() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM reports WHERE id=200').fetchone()[0],1)
        result=__import__('subprocess').run(command+['--apply'],env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
        with release_api.db() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM reports WHERE id=200').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM report_flags WHERE report_id=200').fetchone()[0],0)
    def test_journey_cache_avoids_duplicate_work_and_invalidates_on_index_change(self):
        from unittest.mock import patch
        from test_journey import NOW
        original=self.engine.itinerary
        with patch.object(self.engine,'itinerary',side_effect=lambda a,b,**options:original(a,b,NOW,**options)) as planner:
            self.assertEqual(self.client.get('/api/journeys?from=1&to=3').status_code,200)
            self.assertEqual(self.client.get('/api/journeys?from=1&to=3').status_code,200)
            self.assertEqual(planner.call_count,1)
            with self.engine.connect(readonly=False) as c:c.execute("UPDATE stops SET stop_name='Changed verified fixture' WHERE stop_id='1'")
            response=self.client.get('/api/journeys?from=1&to=3')
            self.assertEqual(planner.call_count,2);self.assertEqual(response.json['origin']['name'],'Changed verified fixture')
    def test_gtfs_staging_rejects_zip_traversal(self):
        from scripts.stage_gtfs import unpack
        import zipfile
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'bad.zip';output=Path(folder)/'out';output.mkdir()
            with zipfile.ZipFile(source,'w') as archive:archive.writestr('../stops.txt','not extracted')
            with self.assertRaises(ValueError):unpack(source,output)
            self.assertEqual(list(output.iterdir()),[])

    def test_encrypted_backup_authentication_and_new_path_restore(self):
        import subprocess,sys,sqlite3
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'backup.sqlite.enc';restore=Path(folder)/'restore.sqlite';wrong=Path(folder)/'wrong.sqlite'
            env={**os.environ,'AYO_ENV':'development','COMMUNITY_DB':release_api.DB,'BACKUP_ENCRYPTION_KEY':Fernet.generate_key().decode()}
            result=subprocess.run([sys.executable,'scripts/community_storage.py','--backup',str(target),'--encrypt-backup'],env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
            self.assertNotEqual(target.read_bytes()[:16],b'SQLite format 3\x00')
            result=subprocess.run([sys.executable,'scripts/restore_backup.py','--source',str(target),'--destination',str(restore)],env=env,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
            c=sqlite3.connect(restore)
            try:self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            finally:c.close()
            result=subprocess.run([sys.executable,'scripts/restore_backup.py','--source',str(target),'--destination',str(wrong)],env={**env,'BACKUP_ENCRYPTION_KEY':Fernet.generate_key().decode()},capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertFalse(wrong.exists())
