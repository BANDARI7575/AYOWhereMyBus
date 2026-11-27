const {openMap,waitForAsync}=require('./navigation-helpers.cjs');
/* Upgrade a real v26 worker to the relocated shell on an isolated loopback origin. */
const {chromium, webkit} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const {readFileSync} = require('node:fs');
const upstream = process.env.AYO_TEST_URL || 'http://127.0.0.1:5001';
const previousWorker = readFileSync('tests/fixtures/pwa-v26/sw.js','utf8');
const previousPage = readFileSync('tests/fixtures/pwa-v26/index.html','utf8');
let oldShell = true;
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/sw.js') {
      response.writeHead(200, {'Content-Type':'text/javascript', 'Cache-Control':'no-store', 'Service-Worker-Allowed':'/'});
      return response.end(oldShell ? previousWorker : readFileSync('static/sw.js'));
    }
    if (oldShell && request.url === '/') {
      response.writeHead(200, {'Content-Type':'text/html', 'Cache-Control':'no-store'});
      return response.end(previousPage);
    }
    const result = await fetch(new URL(request.url, upstream), {redirect:'manual'});
    const headers = Object.fromEntries(result.headers);
    delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding'];
    response.writeHead(result.status, headers);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {response.writeHead(502); response.end(error.message);}
});
(async () => {
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
      oldShell = true;
      const browser = await type.launch({headless:true,...(engine==='chromium' && process.env.AYO_CHROME_PATH ? {executablePath:process.env.AYO_CHROME_PATH} : {})});
      try {
        const context = await browser.newContext(); const page = await context.newPage();
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin,{waitUntil:'load'});
        await page.evaluate(()=>navigator.serviceWorker.ready);
        await page.reload({waitUntil:'load'});
        await page.waitForFunction(()=>navigator.serviceWorker.controller);
        await waitForAsync(page,async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==='activated'&&!r.installing&&!r.waiting&&await caches.has('ayo-shell-v26');});
        const saved = {
          stops:[{id:'1',name:'Saved stop'}],
          routes:[{id:'19',name:'Saved route'}],
          journeys:[{id:'1>2',name:'Saved journey',from:{stop_id:'1'},to:{stop_id:'2'}}]
        };
        await page.evaluate(saved=>{
          localStorage.setItem('ayo-favorites',JSON.stringify(['19']));
          localStorage.setItem('ayo-workspace-favorites',JSON.stringify(saved));
        },saved);
        oldShell = false;
        await page.evaluate(()=>{window.__upgradeControlled=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{window.__upgradeControlled=true;},{once:true});});
        await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
        await waitForAsync(page,async()=>{const registration=await navigator.serviceWorker.getRegistration();const waiting=registration?.waiting;if(!waiting)return false;waiting.postMessage({type:'ACTIVATE'});return true;});
        await waitForAsync(page,async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==='activated'&&!r.installing&&!r.waiting;});
        await page.waitForFunction(()=>window.__upgradeControlled);
        await waitForAsync(page,async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==='activated'&&!r.installing&&!r.waiting;});
        await page.reload({waitUntil:'load'});
        await waitForAsync(page,async()=>{const c=await caches.open('ayo-shell-v35');return !!await c.match('/static/js/app.js')&&!!await c.match('/static/css/home.css');});
        assert.equal(await page.locator('script[src="/static/js/app.js"]').count(),1);
        assert.equal(await page.evaluate(()=>localStorage.getItem('ayo-favorites')),JSON.stringify(['19']));
        assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ayo-workspace-favorites'))),saved);
        assert.equal(await page.locator('#voiceShortcut').count(),1);
        const assets=await page.evaluate(async()=>{const c=await caches.open('ayo-shell-v35');return(await c.keys()).map(r=>new URL(r.url).pathname);});
        for(const asset of ['/static/js/app.js','/static/css/home.css','/static/js/home-stops.js','/static/css/style.css','/static/img/icons.svg','/static/privacy.html'])assert.ok(assets.includes(asset),asset);
        assert.ok(!assets.some(path=>path.startsWith('/api/')));
        await context.setOffline(true);await page.reload({waitUntil:'load'});
        await page.waitForFunction(()=>window.AyoSite&&window.AyoHome);await page.locator('#homeManual').click();assert.equal(await page.locator('#homeLocationForm').isVisible(),true);
        await page.locator('.app-nav [data-view=trip]').click();assert.equal(await page.locator('#planFrom').isVisible(),true);
        await openMap(page);assert.equal(await page.locator('#map').isVisible(),true);
        assert.deepEqual(errors,[]);
        await context.close();console.log('PASS',engine,'real v26→v35 worker upgrade, legacy asset delivery, favorite preservation and offline navigation');
      } finally {await browser.close();}
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
