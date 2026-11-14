/* Utility-first UI regression. Fixtures stay in the browser, never rider storage. */
const {chromium,webkit}=require('playwright');const {default:AxeBuilder}=require('@axe-core/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');const journey=require('../fixtures/journey.json');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5055';const results=[];
(async()=>{for(const [engine,type]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
 try{for(const language of ['en','es'])for(const width of (process.env.AYO_REDESIGN_WIDTHS?process.env.AYO_REDESIGN_WIDTHS.split(',').map(Number):[320,390,1440])){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce',geolocation:{latitude:43.04,longitude:-87.91,accuracy:20},permissions:['geolocation']});
  await context.addInitScript(lang=>{if(localStorage.getItem('ayo-language')===null)localStorage.setItem('ayo-language',JSON.stringify(lang));window.spoken=[];Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(v){window.spoken.push(v.text);}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};},language);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let feedRequests=0,stale=false,weatherFailure=false,planned=null;
  const stops=[{stop_id:'1',stop_name:'WISCONSIN & TEST',name:'WISCONSIN & TEST',stop_lat:43.04,stop_lon:-87.91,latitude:43.04,longitude:-87.91,distance_meters:100,scheduled_directions:[{route_id:'19',route_number:'19',headsign:'Test destination',direction_id:'0'}]},{stop_id:'3',stop_name:'AIRPORT',name:'AIRPORT',stop_lat:43.02,stop_lon:-87.92,latitude:43.02,longitude:-87.92,distance_meters:200,scheduled_directions:[]}];
  await page.route('**/*',async r=>{const u=new URL(r.request().url()),json=d=>r.fulfill({json:d}),now=Math.floor(Date.now()/1000);
   if(u.hostname==='api.open-meteo.com')return weatherFailure?r.fulfill({status:503,body:'Unavailable'}):json({current:{time:now,temperature_2m:32,weather_code:0,wind_speed_10m:2,is_day:1}});
   if(u.origin!==base)return r.abort();
   if(u.pathname==='/api/buses'){feedRequests++;return json({feed_fresh:true,buses:[{bus_id:'fixture',route:u.searchParams.get('route')||'19',latitude:43.4,longitude:-87.9,reported_at:now,speed_kmh:100,direction_degrees:90}]});}
   if(u.pathname==='/api/explore/routes')return json({routes:['BLU','PUR','GRE','19','21'].map(id=>({route_id:id,route_short_name:id,route_long_name:'Verified fixture route'}))});
   if(u.pathname==='/api/stops/search')return json({stops});
   if(u.pathname==='/api/explore/stops')return json({stops,total:2,next_offset:null});
   if(u.pathname.startsWith('/api/explore/stops/'))return json(stops.find(s=>s.stop_id===u.pathname.split('/').at(-1))||stops[0]);
   if(u.pathname==='/api/stops/1/departures')return json({realtime_status:stale?'stale_or_invalid':'fresh',departures:[{route_id:'19',route_number:'19',trip_id:'T',trip_headsign:'Test destination',scheduled_epoch:now+600,prediction_at:now+540,prediction_reported_at:now,prediction_kind:'arrival',data_type:'realtime'},{route_id:'21',trip_id:'U',trip_headsign:'Scheduled destination',scheduled_epoch:now+900,data_type:'scheduled'},{route_id:'19',trip_id:'C',trip_headsign:'Canceled destination',scheduled_epoch:now+1200,canceled:true}]});
   if(u.pathname.includes('/departures'))return json({realtime_status:'fresh',departures:[]});
   if(u.pathname==='/api/service-alerts')return json({status:'fresh',alerts:[{id:'ongoing',active_periods:[{start:now-1000000}],header:[{language,text:language==='es'?'Cambio de servicio':'Service change'}],description:[{language,text:language==='es'?'Consulta las paradas afectadas.':'Check affected stops.'}],affected:[{route_id:'19'},{route_id:'19'},{route_id:'RR3'},{route_id:'RR3'}],url:[{language:'en',text:'https://www.ridemcts.com/'}]},{id:'upcoming',header:[{language,text:'Upcoming fixture'}],active_periods:[{start:now+3600}],affected:[{route_id:'19'}]},{id:'undated',header:[{language,text:'Undated fixture'}],affected:[]},{id:'expired',header:[{language,text:'EXPIRED FIXTURE'}],active_periods:[{end:now-60}],affected:[]}]});
   if(u.pathname==='/api/journey-locations')return json({locations:stops.filter(s=>s.name.toLowerCase().includes((u.searchParams.get('q')||'').toLowerCase()))});
   if(u.pathname==='/api/journeys'){planned=Object.fromEntries(u.searchParams);const delta=now+120-journey.departure;return json({...journey,origin:stops[0],destination:stops[1],departure:journey.departure+delta,arrival:journey.arrival+delta,requested_at:now,valid_until:now+60,legs:journey.legs.map(l=>({...l,departure:l.departure+delta,arrival:l.arrival+delta}))});}
   if(u.pathname.startsWith('/api/routes/'))return json({shapes:[[[43.04,-87.91],[43.02,-87.92]]]});
   if(u.pathname==='/api/push/config')return json({configured:false});
   if(u.pathname==='/api/status')return json({schedule_active_today:true});
   if(u.pathname==='/api/agent/config')return json({live_voice_available:false});
   if(u.pathname==='/api/agent/tools')return json({vehicles:{feed_fresh:true,feed_timestamp:now,buses:[]},official_alerts:{status:'fresh',alerts:[]},community_reports:[]});
   return r.continue();
  });
  await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>AyoI18n.ready);await page.waitForFunction(()=>window.AyoSite&&state.markerIndex.size===1);
  assert.equal(await page.locator('.bats,.hero-background,#clock,#weatherClock').count(),0);
  assert.equal(await page.locator('#winter-watch').isVisible(),false);
  assert.equal(await page.locator('.app-nav a').count(),5);
  assert.equal(await page.locator('#quickRoutes button').count(),5);
  assert.equal(await page.evaluate(()=>scrollY),0);
  await page.locator('.app-nav [data-view=map]').click();await page.waitForFunction(()=>AyoSite.activeView==='map');await page.waitForTimeout(100);
  const center=await page.evaluate(()=>state.map.getCenter());assert.ok(Math.abs(center.lat-43.0389)<.001&&Math.abs(center.lng+87.9065)<.001,JSON.stringify(center));
  assert.equal(await page.evaluate(()=>state.map.getZoom()),12);assert.equal(await page.evaluate(()=>state.markerIndex.values().next().value.getLatLng().lat),43.4);
  await page.evaluate(()=>state.markerIndex.values().next().value.openPopup());await page.locator('.leaflet-popup-content').waitFor({state:'visible'});assert.match(await page.locator('.leaflet-popup-content').textContent(),/62.1 mph/);await page.evaluate(()=>state.map.closePopup());
  await page.locator('.app-nav [data-view=stops]').click();await page.locator('#routeInput').fill('19');await page.locator('#routeForm button[type=submit]').click();await page.waitForFunction(()=>state.route==='19'&&AyoSite.activeView==='map');
  await page.locator('.app-nav [data-view=stops]').click();await page.locator('#favoriteButton').click();assert.deepEqual(await page.evaluate(()=>state.favorites),['19']);
  await page.locator('#stopQuery').fill('Wisconsin');await page.locator('.search-stops button').click();await page.locator('.stop-matches button').first().click();await page.locator('#selectedArrivals .arrival-card').first().waitFor();
  assert.match(await page.locator('#selectedArrivals').innerText(),language==='es'?/Llegada estimada/:/Predicted arrival/);
  assert.match(await page.locator('#selectedArrivals').innerText(),language==='es'?/Cancelado/:/Canceled/);
  const disclosure=page.locator('.stop-detail>details');await disclosure.locator('summary').click();await disclosure.getByRole('button',{name:language==='es'?'Guardar / quitar favorito':'Save / remove favorite',exact:true}).click();
  stale=true;await page.evaluate(()=>AyoRiderTools.refresh());assert.doesNotMatch(await page.locator('#selectedArrivals').innerText(),language==='es'?/Llegada estimada/:/Predicted arrival/);
  await page.locator('.app-nav [data-view=alerts]').click();assert.match(await page.locator('#serviceAlerts>summary').innerText(),/\(3\)/);assert.equal(await page.locator('#serviceAlerts .service-alert').count(),3);assert.equal(await page.locator('#serviceAlerts .service-alert').first().locator('.route-badge').count(),2);assert.doesNotMatch(await page.locator('#serviceAlerts').textContent(),/EXPIRED FIXTURE/);
  await page.locator('.app-nav [data-view=saved]').click();assert.ok((await page.locator('#savedContent input').evaluateAll(nodes=>nodes.map(n=>n.value))).includes('WISCONSIN & TEST'));assert.ok((await page.locator('#savedContent input').evaluateAll(nodes=>nodes.map(n=>n.value))).includes('19'));
  await page.locator('.app-nav [data-view=trip]').click();
  assert.equal(await page.locator('.journey-search-grid').evaluate(n=>[...n.children].map(x=>x.classList.contains('journey-swap')?'swap':x.querySelector('input')?.id).join(',')),'planFrom,swap,planTo');
  await page.evaluate(stops=>dispatchEvent(new CustomEvent('ayo:planner-context',{detail:{from:stops[0],to:stops[1]}})),stops);
  await page.locator('#planJourney').click();await page.locator('#journeyResults h3').waitFor();assert.deepEqual(planned,{from:'1',to:'3',walking:'0',choice:'0'});assert.equal(await page.evaluate(()=>Object.values(state.map._layers).filter(l=>l instanceof L.Polyline).length),2);
  await page.getByRole('button',{name:language==='es'?'Guardar viaje':'Save Journey',exact:true}).click();
  const priorView=await page.evaluate(()=>AyoSite.activeView);await page.locator('#languageButton').click();await page.waitForLoadState('load');await page.waitForFunction(()=>window.AyoSite);await page.evaluate(()=>AyoI18n.ready);assert.equal(await page.evaluate(()=>AyoSite.activeView),priorView);assert.equal(await page.locator('html').getAttribute('lang'),language==='es'?'en':'es');
  // Return to the original language while preserving the selected destination.
  await page.locator('#languageButton').click();await page.waitForLoadState('load');await page.waitForFunction(()=>window.AyoSite);await page.evaluate(()=>AyoI18n.ready);
  await page.locator('.app-nav [data-view=map]').click();const oldRequests=feedRequests;await page.locator('#resumeTracking').click();await page.waitForFunction(()=>state.request===null);assert.ok(feedRequests>oldRequests);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.evaluate(()=>state.timer),null);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>state.timer!==null);assert.doesNotMatch(await page.locator('#trackingState').innerText(),/paused|pausadas/);
  await page.locator('.app-nav [data-view=stops]').click();await page.waitForFunction(()=>document.getElementById('weatherTemp').textContent==='32°F');weatherFailure=true;await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForFunction(()=>document.getElementById('weatherWidget').dataset.availability==='unavailable');assert.match(await page.locator('#weatherTemp').textContent(),/32°F/);
  await page.locator('#mobileMenuButton').click();await page.locator('#themeButton').click();await page.keyboard.press('Escape');assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('day-mode')),true);
  for(const theme of ['light','dark']){
   if(theme==='dark'){await page.locator('#mobileMenuButton').click();await page.locator('#themeButton').click();await page.keyboard.press('Escape');}
   for(const view of ['stops','map','trip','alerts','saved']){await page.locator(`.app-nav [data-view=${view}]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view} overflow`);if(process.env.AYO_REDESIGN_AXE==='1'){const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${engine} ${language} ${width} ${theme} ${view}`);}}
   await page.evaluate(()=>AyoSite.navigate('founder'));if(process.env.AYO_REDESIGN_AXE==='1'){const founder=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(founder.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  }
  assert.deepEqual(errors,[]);results.push({engine,language,width,accessibilityScans:process.env.AYO_REDESIGN_AXE==='1'?12:0,checks:'screens, tracking, route IDs, popups, arrivals, alerts, saves, planner, language, visibility, weather, themes',errors});console.log('PASS utility redesign',engine,language,width);await context.close();
 }}finally{await browser.close();}
}if(process.env.AYO_REDESIGN_REPORT)fs.writeFileSync(process.env.AYO_REDESIGN_REPORT,JSON.stringify(results,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
