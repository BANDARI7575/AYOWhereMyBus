/* Official GTFS and real planner APIs. Only third-party requests are blocked. */
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const {default:AxeBuilder}=require('@axe-core/playwright');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5050';
(async()=>{const results=[];let searches=0;
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
  try{for(const width of [1440,390]){
   // Honor the real production planner budget rather than disabling it for QA.
   if(searches===6)await new Promise(r=>setTimeout(r,60200-Date.now()%60000));
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.AyoSite);await page.evaluate(()=>AyoSite.navigate('trip'));
   async function choose(id,query,stop){
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/journey-locations'&&new URL(r.url()).searchParams.get('q')===query);
    await page.locator('#'+id).fill(query);const data=await(await response).json();const i=data.locations.findIndex(s=>s.stop_id===stop);assert.ok(i>=0);
    await page.locator(`#${id}-list [role=option]`).first().waitFor();
    for(let n=0;n<=i;n++)await page.locator('#'+id).press('ArrowDown');await page.locator('#'+id).press('Enter');
   }
   async function plan(){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/journeys');await page.locator('#planJourney').click();const r=await response;assert.equal(r.status(),200);searches++;return r.json();}
   await choose('planFrom','Wisconsin Cass','2783');await choose('planTo','Wisconsin Jackson','66');
   const exact=await plan();assert.ok(exact.nearby_trip);assert.ok(!exact.legs.some(l=>l.to==='737'||/17TH & WISCONSIN/.test(l.to_stop.name)));
   assert.ok(exact.legs.length===0||exact.legs.length===1,'no reversing transfer for this short trip');
   await page.waitForFunction(()=>document.querySelector('#journeyResults').textContent.includes('These stops are about'));
   const nearby=page.getByRole('button',{name:/Choose nearby destination:.*Stop 9651/});await nearby.waitFor();await nearby.click();
   const direct=await plan();assert.equal(direct.status,'ok');assert.equal(direct.destination.stop_id,'9651');assert.equal(direct.legs.length,1);assert.equal(direct.legs[0].type,'bus');
   await choose('planTo','Wisconsin Jackson','66');await page.locator('#allowEstimatedWalking').check();
   const walk=await plan();assert.equal(walk.status,'ok');assert.equal(walk.walking_estimated,true);const walkingLegs=walk.legs.filter(l=>l.type==='walk');assert.ok(walkingLegs.length);for(const leg of walkingLegs){assert.deepEqual(leg.geometry,[]);assert.equal(leg.estimated,true);}for(const leg of walk.legs.filter(l=>l.type==='bus')){assert.ok(leg.trip_id);assert.ok(leg.to_sequence>leg.from_sequence);}
   // Available schedules can rank a real bus-plus-walk ahead of walking only.
   // Deterministic journey.browser.cjs still requires the walking-only fixture.
   if(walk.legs.every(l=>l.type==='walk')){await page.waitForFunction(()=>document.querySelector('#journeyResults').textContent.includes('Estimated walk only'));assert.ok(!(await page.locator('#journeyResults').innerText()).includes('Scheduled departure'));}
   else await page.waitForFunction(()=>document.querySelector('#journeyResults').textContent.includes('Walking connection:'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   results.push({engine,width,exact_stop_outcome:exact.status,direct_route:direct.legs[0].route_number,direct_seconds:direct.duration_seconds,estimated_walk_seconds:walk.duration_seconds,rendered_journey_axe_violations:axe.violations.length});
   console.log('PASS official Cass/Jackson',engine,width,JSON.stringify(results.at(-1)));await context.close();
  }}finally{await browser.close();}
 }
 if(process.env.AYO_ROUTING_REPORT)fs.writeFileSync(process.env.AYO_ROUTING_REPORT,JSON.stringify({checked_at:new Date().toISOString(),results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
