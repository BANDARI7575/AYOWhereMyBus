/* Unmocked planner E2E against a running server and the actual imported MCTS GTFS.
 * No stop-search, departures or journey responses are intercepted or fabricated.
 */
const {chromium, webkit} = require('playwright');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5050';
const root = path.resolve(__dirname, '../..');
// Find an actually scheduled downstream destination for a Wisconsin suggestion.
// Fail explicitly when the imported schedule doesn't cover this test's date.
const setup = spawnSync(process.env.AYO_PYTHON || path.join(root,'.venv/bin/python'), ['-c', `
import json
from backend.transit_engine import Schedule
s=Schedule()
for origin in s.locations('Wisconsin'):
    for dep in s.departures(origin['stop_id']):
        with s.connect() as c:
            rows=c.execute('SELECT st.stop_id,s.stop_name FROM stop_times st JOIN stops s USING(stop_id) WHERE st.trip_id=? AND CAST(st.stop_sequence AS INTEGER)>? ORDER BY CAST(st.stop_sequence AS INTEGER)',(dep['trip_id'],int(dep['stop_sequence']))).fetchall()
        for row in rows[4:]:
            if row['stop_id']!=origin['stop_id'] and any(x['stop_id']==row['stop_id'] for x in s.locations(row['stop_name'])):
                print(json.dumps({'origin':origin,'destination':{'stop_id':row['stop_id'],'name':row['stop_name']}}));raise SystemExit(0)
raise SystemExit('No covered Wisconsin departure with a searchable downstream stop. Refresh/check GTFS coverage; no itinerary is fabricated.')
`], {cwd:root, encoding:'utf8'});
assert.equal(setup.status, 0, setup.stderr);
const selected = JSON.parse(setup.stdout);
(async () => {
  const results=[];
  for (const engine of (process.env.AYO_BROWSER ? [process.env.AYO_BROWSER] : ['chromium','webkit'])) {
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,
      ...(engine==='chromium' && process.env.AYO_CHROME_PATH ? {executablePath:process.env.AYO_CHROME_PATH}: {})});
    try {
      for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]) {
        const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});
        const page=await context.newPage(); const errors=[], searchRequests=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('response',r=>{if(new URL(r.url()).pathname==='/api/journey-locations')searchRequests.push({url:r.url(),status:r.status()});});
        // Load Leaflet locally for deterministic map QA, block only third-party
        // resources; every same-origin Flask/API request reaches the real server.
        await page.route('**/*',route=>{
          const u=new URL(route.request().url());
          if(u.hostname==='unpkg.com' && u.pathname.endsWith('leaflet.js')) return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});
          if(u.hostname==='unpkg.com' && u.pathname.endsWith('leaflet.css')) return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});
          return u.origin===base ? route.continue() : route.abort();
        });
        await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.AyoSite);await page.evaluate(()=>AyoSite.navigate('trip'));
        const health=await (await page.request.get(base+'/api/health')).json();
        assert.equal(health.planner_api_version,1,'Running server must load current planner API');
        async function choose(id, query, stop) {
          const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/journey-locations' && new URL(r.url()).searchParams.get('q')===query);
          await page.locator('#'+id).fill(query);
          const r=await response; assert.equal(r.status(),200);
          const options=(await r.json()).locations;
          const index=options.findIndex(x=>x.stop_id===stop.stop_id); assert.ok(index>=0,`${stop.name} must be suggested`);
          await page.locator(`#${id}-list [role=option]`).first().waitFor({state:'visible'});
          for(let i=0;i<=index;i++) await page.locator('#'+id).press('ArrowDown');
          await page.locator('#'+id).press('Enter');
          assert.equal(await page.locator('#'+id).inputValue(),stop.name);
          assert.equal(await page.locator('#'+id).getAttribute('aria-expanded'),'false');
        }
        await choose('planFrom','Wisconsin',selected.origin);
        await choose('planTo',selected.destination.name,selected.destination);
        const journeyResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/journeys');
        await page.locator('#planJourney').click();
        const response=await journeyResponse;assert.equal(response.status(),200);
        const journey=await response.json(); assert.equal(journey.status,'ok'); assert.ok(journey.legs.length);
        await page.locator('#journeyResults h3').waitFor();
        const text=await page.locator('#journeyResults').innerText();
        assert.ok(text.includes(selected.origin.name));assert.ok(text.includes(selected.destination.name));
        assert.match(text,/Scheduled departure/);assert.match(text,/Take Route/);
        assert.ok(!/Stop search is unavailable/.test(await page.locator('#journey').innerText()));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert.equal(await page.locator('.journey-search-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),viewport.width<=650?1:3);
        // Both selectors must give real empty results, not an availability error.
        for(const id of ['planFrom','planTo']) {
          await page.locator('#'+id).fill('NoSuchAYOStopzzzz');
          await page.waitForFunction(id=>document.getElementById(id+'-info').textContent.includes('No matching stop names'),id);
          assert.equal(await page.locator(`#${id}-list [role=option]`).count(),0);
        }
        assert.deepEqual(errors,[]);assert.ok(searchRequests.every(r=>r.status===200));
        results.push({engine,viewport:viewport.width,revision:health.source_revision,origin:journey.origin.name,destination:journey.destination.name,
          routes:journey.legs.filter(x=>x.type==='bus').map(x=>x.route_number),scheduled_departure:journey.departure,scheduled_arrival:journey.arrival,
          duration_seconds:journey.duration_seconds,search_responses:searchRequests.map(r=>r.status)});
        console.log(`PASS ${engine} ${viewport.width}px: Wisconsin → ${journey.origin.name} → ${journey.destination.name}; real scheduled routes ${results.at(-1).routes.join(',')}; keyboard/both fields/empty results/layout`);
        await context.close();
      }
    } finally {await browser.close();}
  }
  if(process.env.AYO_LIVE_REPORT) fs.writeFileSync(process.env.AYO_LIVE_REPORT,JSON.stringify({checked_at:new Date().toISOString(),base,results},null,2));
  console.log(`PASS ${results.length} unmocked GTFS end-to-end browser journeys`);
})().catch(e=>{console.error(e);process.exitCode=1;});
