/* Deterministic browser QA: synthetic GTFS fixture responses stay in the test browser. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/journey.json');
const walkingFixture = require('./fixtures/journey-walk.json');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5099';
const synthetic = [fixture.origin, fixture.legs[0].to_stop, fixture.destination].map(s => ({...s, description:'', distance_meters:null}));
const delay = ms => new Promise(r => setTimeout(r,ms));
const output = process.env.AYO_QA_ARTIFACTS;
let checks = 0;
async function run() {
  const browser = await chromium.launch({headless:true, ...(process.env.AYO_CHROME_PATH ? {executablePath:process.env.AYO_CHROME_PATH} : {})});
  try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]) {
      const context = await browser.newContext({viewport, reducedMotion:'reduce', serviceWorkers:'block', geolocation:{latitude:43,longitude:-88}, permissions:['geolocation']});
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      let mode = 'ok', latestQuery = null;
      await page.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'unpkg.com' && u.pathname.endsWith('leaflet.js')) return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});
        if (u.hostname === 'unpkg.com' && u.pathname.endsWith('leaflet.css')) return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});
        if (u.origin !== base) return route.abort();
        const json = data => route.fulfill({json:data});
        if (u.pathname === '/api/journey-locations') {
          const q = (u.searchParams.get('q')||'').toLowerCase();
          if (mode==='nearby-empty' && u.searchParams.has('lat')) return json({locations:[]});
          if (mode === 'search-error') return route.fulfill({status:503,json:{message:'Unavailable'}});
          if (mode === 'race' && q === 'wis') { await delay(700); return json({locations:synthetic.slice(0,2)}).catch(()=>{}); }
          return json({locations: u.searchParams.has('lat') ? synthetic.map(s=>({...s,distance_meters:100})) : synthetic.filter(s=>s.name.toLowerCase().includes(q))});
        }
        if (u.pathname === '/api/journeys') {
          latestQuery = Object.fromEntries(u.searchParams);
          if (mode === 'journey-error') return route.fulfill({status:503,json:{message:'Unavailable'}});
          if (mode === 'walk') return json(walkingFixture);
          if (mode === 'expired') return json({...fixture,valid_until:1});
          if (mode === 'no-route') return json({...fixture,status:'no_route',legs:[],arrival:null});
          if (mode === 'slow') await delay(700);
          return json(fixture).catch(()=>{});
        }
        if (u.pathname === '/api/status') return json({schedule_active_today:true});
        if (u.pathname === '/api/service-alerts') return json({status:'unavailable',alerts:[]});
        if (u.pathname === '/api/winter/reports') return json({reports:[]});
        return route.continue();
      });
      await page.goto(base, {waitUntil:'domcontentloaded'});
      await page.locator('#planFrom').waitFor();
      await page.locator('#planJourney').click();
      assert.match(await page.locator('#journeyStatus').innerText(), /Choose both/); checks++;
      async function choose(id, query) {
        await page.locator('#'+id).fill(query);
        await page.locator(`#${id}-list [role=option]`).first().waitFor({state:'visible'});
        await page.locator('#'+id).press('ArrowDown');
        await page.locator('#'+id).press('Enter');
        assert.equal(await page.locator('#'+id).getAttribute('aria-expanded'),'false');
      }
      await choose('planFrom','Wisconsin'); await choose('planTo','Airport');
      await page.locator('#planJourney').click();
      await page.locator('#journeyResults h3').waitFor();
      assert.deepEqual(latestQuery,{from:'1',to:'3',walking:'0'});
      const text = await page.locator('#journeyResults').innerText();
      for (const term of ['Wisconsin & 6th','Airport','25 min','1 transfer','Take Route 30','Board at','Get off at','Transfer at','12:10','12:35']) assert.ok(text.includes(term),term);
      assert.ok(await page.evaluate(()=>window.state.map && Object.values(window.state.map._layers).some(x=>x instanceof L.Polyline)));
      assert.ok(await page.locator('.creator').innerText().then(x=>x.includes('Abhiraj'))); checks+=3;
      const overflow = await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(n).position!=='absolute').slice(0,15).map(n=>[n.tagName,n.id,n.className,n.getBoundingClientRect().right]));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${viewport.width}: ${JSON.stringify(overflow)}`);
      assert.equal(await page.locator('.journey-search-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length), viewport.width<=650 ? 1 : 2);
      checks+=2;
      if(output) { fs.mkdirSync(output,{recursive:true}); await page.locator('#journey').screenshot({path:path.join(output,`journey-${viewport.width}.png`),style:'.nav,.mobile-bottom-nav,.skip-link{visibility:hidden!important}'}); }
      await page.locator('#planFrom').fill('unknown');
      assert.equal(await page.locator('#journeyResults').innerText(),'');
      await page.waitForFunction(()=>document.querySelector('#planFrom-info').textContent.includes('No matching')); checks++;
      mode='search-error'; await page.locator('#planFrom').fill('Wisconsin');
      await page.waitForFunction(()=>document.querySelector('#planFrom-info').textContent.includes('unavailable')); checks++;
      mode='race'; await page.locator('#planFrom').fill('Wis'); await delay(300); await page.locator('#planFrom').fill('Air');
      await page.locator('#planFrom-list [role=option]').first().waitFor({state:'visible'}); await delay(800);
      assert.match(await page.locator('#planFrom-list').innerText(), /Airport/); assert.doesNotMatch(await page.locator('#planFrom-list').innerText(),/Wisconsin/); checks++;
      mode='nearby-empty'; await page.locator('#planFrom').fill('');
      await page.locator('.journey-location').first().getByRole('button',{name:'Use My Location',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#planFrom-info').textContent.includes('No MCTS stops')); checks++;
      mode='ok';
      await page.locator('.journey-location').first().getByRole('button',{name:'Use My Location',exact:true}).click();
      await page.locator('#planFrom-list [role=option]').first().waitFor({state:'visible'});
      assert.match(await page.locator('#planFrom-list').innerText(),/straight-line distance/);
      await page.locator('#planFrom-list [role=option]').first().click();
      assert.match(await page.locator('#planFrom-info').innerText(),/access walking time is not included/); checks++;
      mode='walk'; await page.locator('#allowEstimatedWalking').check(); await page.locator('#planJourney').click();
      await page.waitForFunction(()=>document.querySelector('#journeyResults').textContent.includes('Walking connection:'));
      assert.match(await page.locator('#journeyResults').innerText(), /straight-line distance/);
      assert.match(await page.locator('#journeyResults').innerText(), /estimated/);
      assert.match(await page.locator('#journeyResults').innerText(), /Tight scheduled connection/);checks++;
      assert.equal(await page.evaluate(()=>Object.values(window.state.map._layers).filter(x=>x instanceof L.Polyline).length), 2); checks++;
      mode='expired'; await page.locator('#planJourney').click();
      await page.waitForFunction(()=>document.querySelector('.journey-freshness').textContent.includes('expired'));checks++;
      mode='no-route'; await page.locator('#planJourney').click();
      await page.waitForFunction(()=>document.querySelector('#journeyResults').textContent.includes('No journey found')); checks++;
      mode='journey-error'; await page.locator('#planJourney').click();
      await page.waitForFunction(()=>document.querySelector('#journeyStatus').textContent.includes('unavailable')); checks++;
      mode='slow'; await page.locator('#planJourney').click(); await delay(100); await page.locator('#planTo').fill('Wisconsin'); await delay(900);
      assert.equal(await page.locator('#journeyResults').innerText(),''); checks++;
      mode='ok';
      await page.evaluate(()=>Object.defineProperty(navigator.geolocation,'getCurrentPosition',{configurable:true,value:ok=>ok({coords:{latitude:43,longitude:-88,accuracy:800}})}));
      await page.locator('.journey-location').last().getByRole('button',{name:'Use My Location',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#planTo-info').textContent.includes('Location accuracy is about 800 m'));checks++;
      await page.evaluate(()=>Object.defineProperty(navigator.geolocation,'getCurrentPosition',{configurable:true,value:(ok,error)=>error({code:1})}));
      await page.locator('.journey-location').last().getByRole('button',{name:'Use My Location',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#planTo-info').textContent.includes('Could not access'),null,{timeout:5000}).catch(async e=>{throw Error('Denied location state: '+await page.locator('#planTo-info').innerText()+' errors: '+JSON.stringify(errors));}); checks++;
      assert.deepEqual(errors,[]); checks++;
      console.log(`PASS ${viewport.width}px: itinerary, map, keyboard suggestions, location, empty/error/race states and responsive layout`);
      await context.close();
    }
    // Render the planner without the map and in Spanish, preserving a useful text journey.
    const context = await browser.newContext({serviceWorkers:'block'}); const page = await context.newPage();
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if(u.pathname==='/static/vendor/leaflet/leaflet.js')return route.abort();
      if(u.origin!==base) return route.abort();
      if(u.pathname==='/api/journey-locations')return route.fulfill({json:{locations:synthetic.filter(s=>s.name.toLowerCase().includes((u.searchParams.get('q')||'').toLowerCase()))}});
      if(u.pathname==='/api/journeys')return route.fulfill({json:fixture});
      if(u.pathname==='/api/status')return route.fulfill({json:{schedule_active_today:true}});
      if(u.pathname==='/api/service-alerts')return route.fulfill({json:{status:'unavailable',alerts:[]}});
      if(u.pathname==='/api/winter/reports')return route.fulfill({json:{reports:[]}});
      return route.continue();
    });
    await page.addInitScript(()=>localStorage.setItem('ayo-language',JSON.stringify('es')));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    for(const [id,q] of [['planFrom','Wisconsin'],['planTo','Airport']]) {
      await page.locator('#'+id).fill(q); await page.locator(`#${id}-list [role=option]`).first().waitFor({state:'visible'});
      await page.locator('#'+id).press('ArrowDown');await page.locator('#'+id).press('Enter');
    }
    await page.locator('#planJourney').click();await page.locator('#journeyResults h3').waitFor();
    assert.match(await page.locator('#journeyResults').innerText(),/Toma la ruta 30/);
    assert.match(await page.locator('#journeyResults').innerText(),/mapa no está disponible/);checks+=2;
    await context.close();
    console.log(`PASS ${checks} browser assertions/scenarios; three responsive viewports and Spanish/map fallback`);
  } finally { await browser.close(); }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
