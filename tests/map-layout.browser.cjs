/* Real vendored Leaflet/CSS and deterministic image tiles; no fabricated transit. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5050';
(async()=>{
 const results=[];
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
  try{for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   const errors=[];page.on('console',m=>{if(m.type()==='error'&&/integrity|stylesheet/i.test(m.text()))errors.push(m.text());});
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname.endsWith('tile.openstreetmap.org'))return route.fulfill({contentType:'image/png',body:fs.readFileSync('static/icon-192.png')});
    if(u.origin!==base)return route.abort();
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/buses'?{buses:[]}:u.pathname==='/api/winter/reports'?{reports:[]}:{status:'unavailable',alerts:[]}});
    return route.continue();
   });
   await page.goto(base,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.state?.map&&document.querySelector('.leaflet-tile-loaded'));
   await page.locator('#map').scrollIntoViewIfNeeded();
   const initial=await page.evaluate(()=>{
    const map=document.querySelector('#map'),tile=map.querySelector('.leaflet-tile');
    return{overflow:getComputedStyle(map).overflow,position:getComputedStyle(tile).position,css:[...document.styleSheets].some(s=>s.href?.endsWith('/leaflet.css')&&s.cssRules.length>100)};
   });
   assert.equal(initial.css,true,`${engine}/${width}: Leaflet stylesheet rejected or missing; ${errors.join(' ')}`);
   assert.equal(initial.overflow,'hidden');assert.equal(initial.position,'absolute');
   assert.deepEqual(errors,[]);
   for(const action of ['initial','pan','zoom','resize']){
    if(action==='resize')await page.setViewportSize({width:width===1440?1000:width+10,height:850});
    await page.evaluate(action=>{const m=window.state.map;if(action==='pan')m.panBy([150,100],{animate:false});if(action==='zoom')m.setZoom(m.getZoom()+1,{animate:false});if(action==='resize')m.invalidateSize();},action);
    await page.waitForTimeout(250);
    const escaped=await page.evaluate(()=>{
     const map=document.querySelector('#map'),r=map.getBoundingClientRect();let failures=0;
     for(const tile of map.querySelectorAll('.leaflet-tile-loaded')){
      const t=tile.getBoundingClientRect();
      for(const [x,y] of [[t.left+2,t.top+2],[t.right-2,t.bottom-2]]){
       if(x<0||x>=innerWidth||y<0||y>=innerHeight||(x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom))continue;
       if(document.elementsFromPoint(x,y).some(e=>e===tile))failures++;
      }
     }return failures;
    });
    assert.equal(escaped,0,`${engine}/${width}/${action}: tiles paint outside map`);
   }
   await page.locator('#map').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   results.push({engine,width,stylesheet:true,clipping:true,pan:true,zoom:true,overflow:false});
   await page.close();
  }}finally{await browser.close();}
 }
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
