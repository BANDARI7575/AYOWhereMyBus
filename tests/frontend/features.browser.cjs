require('./control-audit.cjs');
/* Browser feature contracts use isolated API fixtures; no real reports are posted. */
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5001';
(async()=>{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.addInitScript(()=>{localStorage.setItem('ayo-stops','{}');window.spoken=[];window.notices=[];Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(u){window.spoken.push(u.text);}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};class TestNotification{static requestPermission=async()=> 'granted';constructor(title,options){window.notices.push(options.body);}}window.Notification=TestNotification;});
  let predict=false,stalePrediction=false,staleFeed=false,uncertainty=null;
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.js'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});
   if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.css'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});
   if(u.origin!==base)return route.abort();
   if(u.pathname==='/api/winter/reports')return route.fulfill({json:route.request().method()==='POST'?{message:'Queued for moderation'}:{reports:[]},status:route.request().method()==='POST'?202:200});
   if(u.pathname==='/api/stops/1/departures'){const now=await page.evaluate(()=>Math.floor(Date.now()/1000));return route.fulfill({json:{realtime_status:staleFeed?'stale_or_invalid':'fresh',departures:[{trip_id:'fixture',route_id:'TEST',trip_headsign:'Fixture destination',service_date:'fixture-date',data_type:predict?'realtime':'scheduled',scheduled_epoch:now+120,prediction_at:predict?now+120:null,prediction_reported_at:now-(stalePrediction?600:0),uncertainty_seconds:uncertainty,prediction_kind:'arrival'}]}});}
   if(u.pathname==='/api/stops/search')return route.fulfill({json:{stops:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:{schedule_active_today:true,feed_fresh:true,buses:[],status:'fresh',alerts:[],routes:[],reports:[],configured:false}});
   return route.continue();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor({state:'attached'});
  assert.equal(await page.locator('.journey-location').count(),2); // corrupt favorites must not abort rider tools
  await page.evaluate(()=>window.ayoLoadStop('1'));
  await page.locator('.stop-detail>details>summary').click();
  await page.getByRole('button',{name:'Read departures · AYO Voice',exact:true}).click();
  await page.waitForFunction(()=>window.spoken.length===1);assert.match(await page.evaluate(()=>window.spoken[0]),/Scheduled/);
  async function tick(){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/stops/1/departures');await page.clock.fastForward(31000);await(await response).finished();await new Promise(r=>setTimeout(r,30));}
  await page.getByRole('button',{name:'Enable arrival alert (keep page open)',exact:true}).click();
  await tick();assert.equal(await page.evaluate(()=>window.notices.length),0);
  predict=true;stalePrediction=true;await tick();assert.equal(await page.evaluate(()=>window.notices.length),0);
  stalePrediction=false;staleFeed=true;await tick();assert.equal(await page.evaluate(()=>window.notices.length),0);
  staleFeed=false;uncertainty=-1;await tick();assert.equal(await page.evaluate(()=>window.notices.length),0);
  uncertainty=null;await tick();await page.waitForFunction(()=>window.notices.length===1);assert.equal(await page.evaluate(()=>window.notices.length),1);
  await page.clock.fastForward(31000);assert.equal(await page.evaluate(()=>window.notices.length),1); // same trip not repeated
  // Legacy Winter Watch form was retired by the approved redesign; API moderation remains covered in backend tests.
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor({state:'attached'});
  const cached=await page.evaluate(async()=>{const c=await caches.open('ayo-shell-v26');return(await c.keys()).map(r=>new URL(r.url).pathname);});
  assert.ok(cached.includes('/static/journey.js'));assert.ok(!cached.some(p=>p.startsWith('/api/')));
  await context.setOffline(true);await page.waitForFunction(()=>!navigator.onLine);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor({state:'attached'});
  assert.match(await page.locator('#riderTools').innerText(),/Offline:/);
  assert.deepEqual(errors,[]);
  console.log(engine,'PASS current feature contracts: stale prediction/feed and invalid uncertainty suppression, corrupt favorites, labeled voice, scheduled-only notification suppression, matched notification, deduplication, PWA shell, uncached APIs, offline reload/banner');
  await context.close();
 }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
