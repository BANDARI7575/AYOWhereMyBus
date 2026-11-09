/* Integrated regression contracts for both languages; test-only transit/weather fixtures. */
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5050';
(async()=>{
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
  try{for(const language of ['en','es'])for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},geolocation:{latitude:43,longitude:-88},permissions:['geolocation'],reducedMotion:'reduce',serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(lang=>{localStorage.setItem('ayo-language',JSON.stringify(lang));window.spoken=[];window.nativeVoiceSupported=!!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(u){window.spoken.push({text:u.text,lang:u.lang});}}});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;this.lang='';}}});},language);
   await page.route('**/*',route=>{const u=new URL(route.request().url());const now=Math.floor(Date.now()/1000);
    if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.js'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});
    if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.css'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});
    if(u.hostname==='api.open-meteo.com')return route.fulfill({json:{current:{time:now,temperature_2m:25,weather_code:71,wind_speed_10m:8}}});
    if(u.origin!==base)return route.abort();
    const json=data=>route.fulfill({json:data});
    if(u.pathname==='/api/buses')return json({feed_fresh:true,buses:[{bus_id:'fixture-bus',route:'30',latitude:43,longitude:-88,reported_at:now,speed_kmh:15,direction_degrees:90}]});
    if(u.pathname==='/api/stops/nearby')return json({stops:[{stop_id:'1',stop_code:'1',stop_name:'WISCONSIN & TEST',latitude:43,longitude:-88,distance_meters:100}]});
    if(u.pathname==='/api/stops/1/routes')return json({routes:[{route_id:'30',route_number:'30',route_name:'Wisconsin Avenue',destinations:[{headsign:'Official fixture destination',direction_id:'0'}]}]});
    if(u.pathname==='/api/stops/1/departures')return json({realtime_status:'fresh',departures:[{trip_id:'fixture',service_date:'20261109',route_id:'30',trip_headsign:'Official fixture destination',data_type:'scheduled',scheduled_epoch:now+600,prediction_at:null}]});
    if(u.pathname==='/api/stops/search')return json({stops:[{stop_id:'1',stop_name:'WISCONSIN & TEST',stop_lat:43,stop_lon:-88}]});
    if(u.pathname==='/api/status')return json({schedule_active_today:true});
    if(u.pathname==='/api/service-alerts')return json({status:'unavailable',alerts:[]});
    if(u.pathname==='/api/push/config')return json({configured:false});
    if(u.pathname==='/api/winter/reports')return json(route.request().method()==='POST'?{message:'Queued for moderation; expires in 24 hours'}:{reports:[]});
    return route.continue();
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();await page.evaluate(()=>window.AyoI18n.ready);
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   if(language==='es'){
    assert.match(await page.title(),/Dónde está/);assert.match(await page.locator('#creator').innerText(),/LA MENTE DETRÁS/);
    assert.match(await page.locator('#nearbyStopsPanel').innerText(),/Paradas cercanas de MCTS/);
    assert.equal(await page.locator('#planFrom').getAttribute('aria-label'),null);
    assert.match(await page.locator('label[for=planFrom]').innerText(),/Origen/);
   }
   await page.locator('#routeInput').fill('30');await page.locator('#routeForm').evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>window.state.markerIndex.size===1);
   await page.locator('#favoriteButton').click();assert.deepEqual(await page.evaluate(()=>state.favorites),['30']);
   await page.locator('#findStopsButton').click();await page.locator('#nearbyStopsResults button').first().waitFor();
   await page.locator('#nearbyStopsResults button').first().click();
   const voice=page.getByRole('button',{name:language==='es'?'Leer salidas · AYO Voice':'Read departures · AYO Voice',exact:true});await voice.click();
   await page.waitForFunction(()=>window.spoken.length===1);const spoken=await page.evaluate(()=>window.spoken[0]);assert.equal(spoken.lang,language==='es'?'es-US':'en-US');assert.match(spoken.text,language==='es'?/Programado/:/Scheduled/);
   await page.locator('#winterStop').fill('1');await page.locator('#winterText').fill('Isolated browser fixture observation.');
   await page.getByRole('button',{name:language==='es'?'Enviar para revisión':'Submit for moderation',exact:true}).click();
   await page.waitForFunction(lang=>document.querySelector('#winterStatus').textContent.includes(lang==='es'?'revisión':'Queued'),language);
   await page.waitForFunction(lang=>document.querySelector('#weatherCondition').textContent.includes(lang==='es'?'Nevando':'Snowing'),language);
   if(width<=390){await page.locator('#mobileMenuButton').click();assert.equal(await page.locator('#mobileMenuButton').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#mobileMenuButton').getAttribute('aria-expanded'),'false');}
   await page.getByRole('button',{name:language==='es'?'Instalar AYO':'Install AYO',exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow: '+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(n).position!=='absolute').slice(0,8).map(n=>[n.tagName,n.id,n.className,n.getBoundingClientRect().right]))));
   assert.deepEqual(errors,[]);
   console.log(`PASS ${engine} ${language} ${width}px: tracking, route/favorites, nearby stops/routes, weather, voice language, moderation feedback, mobile navigation, install help and creator`);
   await context.close();
  }}finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
