const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function location(secure,code){let calls=0;const context={module:{exports:{}},isSecureContext:secure,navigator:{geolocation:{getCurrentPosition(_yes,no){calls++;no({code});}}}};vm.runInNewContext(fs.readFileSync('static/location-access.js','utf8'),context);return {api:context.module.exports,get calls(){return calls;}};}
test('insecure location fails before requesting permission; denied, unavailable and timeout stay distinct',async()=>{
 const insecure=location(false,1);await assert.rejects(insecure.api.request(),/trusted HTTPS/);assert.equal(insecure.calls,0);
 for(const [code,text]of [[1,'permission denied'],[2,'Location unavailable'],[3,'timed out']]){const flow=location(true,code);await assert.rejects(flow.api.request(),new RegExp(text));assert.equal(flow.calls,1);}
 const spanish=location(false,1);await assert.rejects(spanish.api.request({es:true}),/HTTPS de confianza/);
});
function store(responses){const rendered=[];let calls=0;const doc={documentElement:{lang:'en'}},root={document:doc,dispatchEvent(){},addEventListener(){},AyoTransit:{renderAlerts(host,data,route,language){rendered.push({host,data,route,language});}},async fetch(){calls++;const r=responses.shift();if(r instanceof Error)throw r;return {ok:true,json:async()=>r};}};vm.runInNewContext(fs.readFileSync('static/alert-store.js','utf8'),{window:root,document:doc,Event:class{}});return {api:root.AyoAlertStore,rendered,get calls(){return calls;}};}
test('all bound alert views share one fetch, snapshot and explicit language',async()=>{
 const s=store([{status:'fresh',alerts:[{id:'verified'}],feed_timestamp:100}]);const a={isConnected:true},b={isConnected:true};s.api.bind(a,'30','es');s.api.bind(b,'30','en');await s.api.refresh();assert.equal(s.calls,1);const rows=s.rendered.slice(-2);assert.equal(rows[0].data,rows[1].data);assert.equal(rows[0].data.alerts[0].id,'verified');assert.equal(rows[0].language,'es');assert.equal(rows[1].language,'en');
});
test('failed refresh preserves last-good data and timestamp; cold failures remain unknown',async()=>{
 const s=store([{status:'fresh',alerts:[{id:'verified'}],feed_timestamp:100},Error('offline')]);await s.api.refresh();await s.api.refresh();assert.equal(s.api.snapshot.status,'stale');assert.equal(s.api.snapshot.feed_timestamp,100);assert.equal(s.api.snapshot.alerts[0].id,'verified');
 const cold=store([Error('offline'),{status:'stale_or_invalid',alerts:[]}]);await cold.api.refresh();await cold.api.refresh();assert.equal(cold.api.snapshot.status,'unavailable');assert.equal(cold.api.snapshot.received_at,undefined);
});
