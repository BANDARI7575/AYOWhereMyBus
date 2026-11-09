/* Browser feature contracts use isolated API fixtures; no real reports are posted. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5050';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.addInitScript(()=>{localStorage.setItem('ayo-stops','{}');window.spoken=[];window.notices=[];speechSynthesis.speak=u=>window.spoken.push(u.text);class TestNotification{static requestPermission=async()=> 'granted';constructor(title,options){window.notices.push(options.body);}}window.Notification=TestNotification;});
  let predict=false;
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.js'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});
   if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.css'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});
   if(u.origin!==base)return route.abort();
   if(u.pathname==='/api/winter/reports')return route.fulfill({json:route.request().method()==='POST'?{message:'Queued for moderation'}:{reports:[]},status:route.request().method()==='POST'?202:200});
   if(u.pathname==='/api/stops/1/departures')return route.fulfill({json:{realtime_status:'fresh',departures:[{trip_id:'fixture',route_id:'TEST',trip_headsign:'Fixture destination',service_date:'fixture-date',data_type:predict?'realtime':'scheduled',scheduled_epoch:Math.floor(Date.now()/1000)+120,prediction_at:predict?Math.floor(Date.now()/1000)+120:null,prediction_kind:'arrival'}]}});
   if(u.pathname==='/api/stops/search')return route.fulfill({json:{stops:[]}});
   return route.continue();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();
  assert.equal(await page.locator('.journey-location').count(),2); // corrupt favorites must not abort rider tools
  await page.evaluate(()=>window.ayoLoadStop('1'));
  await page.getByRole('button',{name:'Read departures · AYO Voice',exact:true}).click();
  await page.waitForFunction(()=>window.spoken.length===1);assert.match(await page.evaluate(()=>window.spoken[0]),/Scheduled/);
  await page.getByRole('button',{name:'Enable arrival alert (keep page open)',exact:true}).click();
  await page.clock.fastForward(31000);assert.equal(await page.evaluate(()=>window.notices.length),0);
  predict=true;await page.clock.fastForward(31000);await page.waitForFunction(()=>window.notices.length===1);assert.equal(await page.evaluate(()=>window.notices.length),1);
  await page.clock.fastForward(31000);assert.equal(await page.evaluate(()=>window.notices.length),1); // same trip not repeated
  await page.locator('#winterStop').fill('1');await page.locator('#winterText').fill('Synthetic test report.');
  await page.getByRole('button',{name:'Submit for moderation',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#winterStatus').textContent.includes('Queued'));assert.match(await page.locator('#winterStatus').innerText(),/Queued/);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();
  const cached=await page.evaluate(async()=>{const c=await caches.open('ayo-shell-v6');return(await c.keys()).map(r=>new URL(r.url).pathname);});
  assert.ok(cached.includes('/static/journey.js'));assert.ok(!cached.some(p=>p.startsWith('/api/')));
  await context.setOffline(true);await page.waitForFunction(()=>!navigator.onLine);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();
  assert.match(await page.locator('#riderTools').innerText(),/Offline:/);
  assert.deepEqual(errors,[]);
  console.log('PASS 9 feature contracts: corrupt favorites, labeled voice, scheduled-only notification suppression, matched notification, deduplication, local report feedback, PWA shell, uncached APIs, offline reload/banner');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
