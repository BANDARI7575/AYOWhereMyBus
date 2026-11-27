/* Synthetic reports stay in browser interception, never community storage. */
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {default:AxeBuilder}=require('@axe-core/playwright');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5055';
(async()=>{for(const [engine,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
 try{for(const width of [390,1440])for(const language of ['en','es']){
  const c=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',ignoreHTTPSErrors:base.startsWith('https://127.0.0.1:')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Date.parse('2026-11-24T15:00:00Z')/1000;
  await p.clock.install({time:new Date(now*1000)});
  await p.addInitScript(language=>{localStorage.setItem('ayo-language',JSON.stringify(language));window.geoCalls=0;Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied'})}});Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){geoCalls++;throw Error('Alerts must not request GPS');}}});},language);
  const rows=Array.from({length:51},(_,i)=>({stop_id:String(i+1),name:'GTFS STOP '+(i+1),latitude:43,longitude:-88,distance_meters:i*10,scheduled_directions:[]}));
  let stopFailure=false,stopIncomplete=false,reportFailure=false,reportIncomplete=false,empty=false;
  let expired=false,expiryAt=0,nearbyCalls=0,hold=false,release=null;const radii=[];
  await p.route('**/*',r=>{
   const u=new URL(r.request().url()),json=data=>r.fulfill({json:data});if(u.origin!==new URL(base).origin)return r.abort();
   if(u.pathname==='/api/explore/stops'){
    nearbyCalls++;radii.push(u.searchParams.get('radius'));if(stopFailure)return r.fulfill({status:503,json:{message:'Unavailable'}});
    const all=empty?[]:Number(u.searchParams.get('radius'))===.1?rows.slice(0,1):rows,offset=Number(u.searchParams.get('offset')||0);
    return json({stops:all.slice(offset,offset+50),total:all.length+(stopIncomplete?1:0),next_offset:all.length>offset+50?offset+50:null,retrieved_at:now});
   }
   if(u.pathname==='/api/winter/reports/nearby'){
    assert.equal(r.request().method(),'POST');assert.equal(u.search,'');
    const body=r.request().postDataJSON(),ids=body.stop_ids;
    assert.deepEqual(Object.keys(body),['stop_ids']);
    assert.deepEqual(ids,rows.slice(0,ids.length).map(row=>row.stop_id),'send every paginated stop in the selected radius');
    if(reportFailure)return r.fulfill({status:503,json:{message:'Unavailable'}});
    const report={id:1,stop_id:'51',text:'<img src=x onerror=alert(1)> isolated observation',created:expired?expiryAt-86400:now,expires:expired?expiryAt:now+86400};
    const reports=ids.includes('51')?Array.from({length:expired?1:101},(_,i)=>({...report,id:i+1})):[];
    const respond=()=>json({reports,count:reports.length+(reportIncomplete?1:0),retrieved_at:expired?Math.floor(expiryAt)-1:now});
    if(hold){hold=false;return new Promise(resolve=>{release=()=>respond().catch(()=>{}).finally(resolve);});}
    return respond();
   }
   if(u.pathname.startsWith('/api/'))return json({configured:false,reports:[],routes:[],stops:[],buses:[],departures:[],alerts:[],status:'unavailable'});
   return r.continue();
  });
  await p.goto(base+'/#alerts');await p.evaluate(()=>AyoI18n.ready);await p.waitForFunction(()=>window.AyoHome&&document.getElementById('nearbyConditionsStatus').textContent.length>0);
  await p.locator('#nearbyConditions>summary').click();
  assert.equal(nearbyCalls,0);assert.equal(await p.evaluate(()=>geoCalls),0);
  assert.match(await p.locator('#nearbyConditionsStatus').innerText(),language==='es'?/nunca solicita/:/never requests/);
  await p.evaluate(()=>AyoHome.chooseLocation({latitude:43,longitude:-88},'manual','Selected on Home'));
  await p.clock.runFor(300);await p.waitForFunction(()=>document.getElementById('nearbyReportCount').textContent==='101');
  assert.equal(await p.locator('#nearbyReportsList li').count(),101);
  assert.equal(await p.locator('#nearbyStopsList li').count(),51,'must include all paginated stops');
  assert.match(await p.locator('#nearbyReportsList').innerText(),/GTFS STOP 51/);
  assert.equal(await p.locator('#nearbyReportsList img').count(),0,'observations are text, never HTML');
  hold=true;await p.locator('#refreshNearbyConditions').click();
  await expectRelease();
  const before=nearbyCalls;await p.evaluate(()=>AyoSite.navigate('stops'));await p.locator('#homeRadius').focus();await p.locator('#homeRadius').press('Home');
  await p.clock.runFor(300);await p.evaluate(()=>AyoSite.navigate('alerts'));await p.waitForFunction(()=>document.getElementById('nearbyReportCount').textContent==='0');
  await release();
  assert.equal(await p.locator('#nearbyReportCount').innerText(),'0');assert.ok(nearbyCalls>before);assert.ok(radii.includes('0.1'));
  for(const failure of ['network','reports','stops']){
   reportFailure=failure==='network';reportIncomplete=failure==='reports';stopIncomplete=failure==='stops';
   await p.locator('#refreshNearbyConditions').click();await p.waitForFunction(()=>document.getElementById('nearbyConditions').getAttribute('aria-busy')==='false');
   assert.match(await p.locator('#nearbyReportState').innerText(),language==='es'?/Últimos/:/Last known/);
   assert.equal(await p.locator('#nearbyReportCount').innerText(),'—');
   assert.equal(await p.locator('#nearbyReportsList li').count(),0);
  }
  reportIncomplete=stopIncomplete=false;
  stopFailure=true;await p.evaluate(()=>AyoHome.chooseLocation({latitude:44,longitude:-88},'manual','New location'));
  await p.clock.runFor(300);await p.waitForFunction(()=>document.getElementById('nearbyConditions').getAttribute('aria-busy')==='false');
  assert.equal(await p.locator('#nearbyStopCount').innerText(),'—');assert.equal(await p.locator('#nearbyReportCount').innerText(),'—');assert.equal(await p.locator('#nearbyStopsList li').count(),0,'old-location results must disappear');
  stopFailure=reportFailure=false;empty=true;await p.locator('#refreshNearbyConditions').click();await p.waitForFunction(()=>document.getElementById('nearbyStopCount').textContent==='0');
  assert.equal(await p.locator('#nearbyReportCount').innerText(),'0');assert.match(await p.locator('#nearbyStopsList').innerText(),language==='es'?/No se encontraron/:/No MCTS stops/);
  empty=false;expired=true;expiryAt=await p.evaluate(()=>Date.now()/1000+1);await p.evaluate(()=>{const input=document.getElementById('homeRadius');input.value='.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.clock.runFor(300);await p.waitForFunction(()=>document.getElementById('nearbyReportCount').textContent==='1');
  await p.clock.runFor(1000);assert.equal(await p.locator('#nearbyReportCount').innerText(),'0');assert.doesNotMatch(await p.locator('#nearbyReportsList').innerText(),/isolated observation/);
  await p.clock.runFor(120000);await p.waitForFunction(()=>document.getElementById('nearbyConditions').getAttribute('aria-busy')==='false');
  assert.match(await p.locator('#nearbyAlertState').innerText(),language==='es'?/Últimas/:/Last known/,'stale API timestamps must stay labeled');
  assert.equal(await p.evaluate(()=>geoCalls),0);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const light of [false,true]){await p.evaluate(light=>document.body.classList.toggle('day-mode',light),light);const a=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(a.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  assert.deepEqual(errors,[]);console.log('PASS nearby summary',engine,width,language,'shared location/radius, pagination, expiry, text safety, unavailable/stale/empty, no GPS and accessibility');await c.close();
  async function expectRelease(){
   for(let attempt=0;attempt<100&&!release;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
   assert.equal(typeof release,'function','previous report request must be in flight');
  }
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
