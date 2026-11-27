const {openMap,waitForAsync}=require('./navigation-helpers.cjs');
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5055';
(async()=>{for(const [engine,type]of [['chromium',chromium],['webkit',webkit]]){const b=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});try{
 const c=await b.newContext(),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base,{waitUntil:'load'});await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload({waitUntil:'load'});await p.waitForFunction(()=>navigator.serviceWorker.controller);
 // Verify the controlled live page receives current bytes, then heals a stale cached copy.
 const served=await p.evaluate(async()=>{const r=await fetch('/static/js/app.js',{cache:'no-cache'});return {text:await r.text(),cache:r.headers.get('Cache-Control')};});
 assert.equal(served.text,readFileSync('static/js/app.js','utf8'),'served script matches workspace');assert.match(served.cache,/no-cache/);
 await p.evaluate(async()=>{const c=await caches.open('ayo-shell-v35');await c.put('/static/js/app.js',new Response('/* synthetic stale cache */',{headers:{'Content-Type':'text/javascript'}}));await fetch('/static/js/app.js',{cache:'no-cache'});});
 await waitForAsync(p,async source=>{const c=await caches.open('ayo-shell-v35');const response=await c.match('/static/js/app.js');return response&&await response.text()===source;},served.text);
 assert.equal(await p.locator('script[src="/static/js/app.js"]').count(),1);
 const sourceMap=await p.request.get(base+'/static/vendor/leaflet/leaflet.js.map');assert.equal(sourceMap.status(),200);assert.equal((await sourceMap.json()).version,3);
 const assets=await p.evaluate(async()=>{const cache=await caches.open('ayo-shell-v35');return(await cache.keys()).map(r=>new URL(r.url).pathname);});
 for(const file of ['/static/css/founder.css','/static/img/founder-leaning.png','/static/css/home.css','/static/js/home-stops.js','/static/js/navigation.js','/static/js/transit-ui.js','/static/js/units.js','/static/img/icons.svg','/static/js/journey.js'])assert.ok(assets.includes(file),file);
 assert.ok(!assets.some(path=>path.startsWith('/api/')||path.includes('milwaukee-cinematic')));
 await c.setOffline(true);await p.reload({waitUntil:'load'});await p.waitForFunction(()=>window.AyoSite&&window.AyoHome);await p.locator('#homeManual').click();assert.equal(await p.locator('#homeLocationForm').isVisible(),true);assert.equal(await p.locator('#networkStatus').isVisible(),true);assert.match(await p.locator('#networkStatus').textContent(),/Offline/);assert.equal(await p.evaluate(()=>state.markerIndex.size),0);
 await p.locator('.app-nav [data-view=trip]').click();assert.equal(await p.locator('#planFrom').isVisible(),true);await openMap(p);assert.equal(await p.locator('#map').isVisible(),true);
 await p.evaluate(()=>AyoSite.navigate('founder'));await p.locator('#founder img').evaluate(n=>n.decode());assert.equal(await p.locator('#founder img').evaluate(n=>n.complete&&n.naturalWidth>0),true);assert.match(await p.locator('#founder .founder-light').evaluate(n=>getComputedStyle(n).animationName),/founder-swing/);assert.deepEqual(errors,[]);await c.close();console.log('PASS',engine,'current served bytes, stale-cache repair, source map, PWA shell, no API/large hero caching, offline Founder asset and navigation and honest data availability');
 }finally{await b.close();}}})().catch(e=>{console.error(e);process.exitCode=1;});
