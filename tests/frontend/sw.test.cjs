const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function worker(){const handlers={},notices=[];const context={URL,Date,Response,fetch,clients:{},self:{location:{origin:'https://ayo.example'},registration:{showNotification:(...args)=>{notices.push(args);return Promise.resolve();}},addEventListener:(type,fn)=>handlers[type]=fn}};vm.runInNewContext(fs.readFileSync('static/sw.js','utf8'),context);return {handlers,notices};}
test('fresh background payload is shown; expired arrivals become a safe refresh message',async()=>{const w=worker();let pending;w.handlers.push({data:{json:()=>({body:'Verified fixture prediction',expires_at:Date.now()/1000+30,prediction_at:Date.now()/1000+60,tag:'one-shot'})},waitUntil:p=>pending=p});await pending;assert.equal(w.notices[0][1].body,'Verified fixture prediction');w.handlers.push({data:{json:()=>({body:'Old prediction must not appear',expires_at:1,prediction_at:2,language:'es'})},waitUntil:p=>pending=p});await pending;assert.match(w.notices[1][1].body,/caducado/);assert.doesNotMatch(w.notices[1][1].body,/Old prediction/);});

test('successful shell fetch refreshes an old cached script before offline fallback',async()=>{
 const handlers={};let saved=new Response('old app'),online=true;
 const cache={put:async(_request,response)=>{saved=response;}};
 const context={URL,Date,Response,location:{origin:'https://ayo.example'},
  caches:{open:async()=>cache,match:async()=>saved.clone()},
  fetch:async()=>{if(!online)throw Error('offline');return new Response('current app');},
  self:{addEventListener:(type,fn)=>handlers[type]=fn}};
 vm.runInNewContext(fs.readFileSync('static/sw.js','utf8'),context);
 async function request(path){let response;const work=[];handlers.fetch({request:{method:'GET',url:'https://ayo.example'+path},respondWith:p=>response=p,waitUntil:p=>work.push(p)});await Promise.all(work);return response;}
 assert.equal(await(await request('/static/app.js')).text(),'current app');
 assert.equal(await saved.clone().text(),'current app');
 online=false;
 assert.equal(await(await request('/static/app.js')).text(),'current app');
 assert.equal(await request('/api/buses'),undefined,'API data must never enter the shell cache');
});
