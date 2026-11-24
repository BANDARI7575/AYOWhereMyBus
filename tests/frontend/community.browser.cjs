/* Report submissions and moderation are browser fixtures, never rider data. */
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {default:AxeBuilder}=require('@axe-core/playwright');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5055';
(async()=>{for(const [engine,type]of Object.entries({chromium,webkit})){
 const browser=await type.launch({headless:true});
 try{for(const width of [390,1440])for(const language of ['en','es']){
  const c=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',ignoreHTTPSErrors:base.startsWith('https://127.0.0.1:')});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const now=Math.floor(Date.now()/1000);await p.clock.install({time:new Date(now*1000)});
  await p.addInitScript(language=>{localStorage.setItem('ayo-language',JSON.stringify(language));window.geoCalls=0;Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied'})}});Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){geoCalls++;throw Error('Report form must not request location');}}});},language);
  const stops=[{stop_id:'1',name:'VERIFIED TEST STOP',latitude:43,longitude:-88,distance_meters:50,scheduled_directions:[]}];
  const categories=[{id:'snow_ice',en:'Snow or ice',es:'Nieve o hielo'},{id:'lighting',en:'Lighting concern',es:'Problema de iluminación'}];
  let posts=[],code=202,hold=false,release=null,approved=false,expiry=null;
  await p.route('**/*',r=>{
   const u=new URL(r.request().url()),json=data=>r.fulfill({json:data});if(u.origin!==new URL(base).origin)return r.abort();
   if(u.pathname==='/api/community/config')return json({categories,comment_max_length:500});
   if(u.pathname==='/api/explore/stops')return json({stops,total:1,next_offset:null,retrieved_at:now});
   if(u.pathname==='/api/winter/reports'&&r.request().method()==='POST'){
    posts.push(r.request().postDataJSON());const fulfill=()=>r.fulfill({status:code,json:code===202?{id:1,state:'pending',created:now,expires:now+86400}:{message:'Isolated rejection'}});
    if(hold)return new Promise(resolve=>{release=()=>fulfill().finally(resolve);});return fulfill();
   }
   if(u.pathname==='/api/winter/reports')return json({reports:approved?[{id:1,stop_id:'1',category:'snow_ice',category_labels:{en:'Snow or ice',es:'Nieve o hielo'},text:'',created:expiry?expiry-86400:now,expires:expiry||now+86400}]:[]});
   if(u.pathname.startsWith('/api/'))return json({configured:false,status:'unavailable',reports:[],stops:[],routes:[],departures:[],buses:[],alerts:[]});return r.continue();
  });
  await p.goto(base+'/#alerts');await p.evaluate(()=>AyoI18n.ready);await p.waitForFunction(()=>window.AyoHome);
  await p.locator('#communitySubmission>summary').click();assert.equal(await p.locator('#submitCommunityReport').isDisabled(),true);assert.equal(await p.evaluate(()=>geoCalls),0);
  await p.evaluate(()=>AyoHome.chooseLocation({latitude:43,longitude:-88},'manual','Home selection'));
  await p.clock.runFor(300);await p.waitForFunction(()=>!document.getElementById('submitCommunityReport').disabled);
  await p.locator('#submitCommunityReport').click();assert.match(await p.locator('#communitySubmissionStatus').innerText(),language==='es'?/Elige una parada/:/Choose a current nearby stop/);assert.equal(posts.length,0);
  await p.locator('#communityStop').selectOption('1');await p.locator('#submitCommunityReport').click();assert.match(await p.locator('#communitySubmissionStatus').innerText(),language==='es'?/categoría/:/category/);assert.equal(posts.length,0);
  await p.locator('#communityCategory').selectOption('snow_ice');hold=true;await p.locator('#submitCommunityReport').click();await p.waitForFunction(()=>document.getElementById('communityReportForm').getAttribute('aria-busy')==='true');assert.equal(await p.locator('#submitCommunityReport').isDisabled(),true);await p.locator('#communityReportForm').dispatchEvent('submit');assert.equal(posts.length,1);assert.deepEqual(posts[0],{stop_id:'1',category:'snow_ice',comment:''});hold=false;await release();
  await p.waitForFunction(()=>document.getElementById('communityReportForm').getAttribute('aria-busy')==='false');
  assert.match(await p.locator('#communitySubmissionStatus').innerText(),language==='es'?/No será público hasta aprobarse/:/not public until approved/);
  assert.equal(await p.locator('#communityComment').inputValue(),'');assert.equal(await p.locator('#nearbyReportCount').innerText(),'0');
  await p.waitForFunction(()=>!document.getElementById('submitCommunityReport').disabled);await p.locator('#communityCategory').selectOption('snow_ice');await p.locator('#submitCommunityReport').click();assert.equal(posts.length,1,'same-session repeat must not consume another request');
  approved=true;await p.locator('#nearbyConditions>summary').click();await p.locator('#refreshNearbyConditions').click();await p.waitForFunction(()=>document.getElementById('nearbyReportCount').textContent==='1');assert.match(await p.locator('#nearbyReportsList').innerText(),language==='es'?/Nieve o hielo/:/Snow or ice/);
  await p.locator('#communityCategory').selectOption('lighting');await p.locator('#communityComment').fill('Fixture observation only.');
  for(const status of [409,429,400,503]){code=status;await p.locator('#submitCommunityReport').click();await p.waitForFunction(()=>document.getElementById('communityReportForm').getAttribute('aria-busy')==='false');assert.match(await p.locator('#communitySubmissionStatus').innerText(),status===409?(language==='es'?/ya se envió/:/already submitted/):status===429?(language==='es'?/límite/:/limit/):status===400?(language==='es'?/Comprueba/:/Check the stop/):(language==='es'?/No se confirmó/:/not confirmed/));assert.equal(await p.locator('#communityComment').inputValue(),'Fixture observation only.');}
  await c.setOffline(true);await p.waitForFunction(()=>document.getElementById('submitCommunityReport').disabled);await c.setOffline(false);await p.waitForFunction(()=>!document.getElementById('submitCommunityReport').disabled);
  expiry=await p.evaluate(()=>Date.now()/1000+1);await p.locator('#refreshNearbyConditions').click();await p.waitForFunction(()=>document.getElementById('nearbyConditions').getAttribute('aria-busy')==='false');await p.clock.runFor(1000);assert.equal(await p.locator('#nearbyReportCount').innerText(),'0');
  await p.evaluate(()=>AyoHome.chooseLocation({latitude:44,longitude:-88},'manual','Different location'));await p.clock.runFor(300);await p.waitForFunction(()=>!document.getElementById('submitCommunityReport').disabled);assert.equal(await p.locator('#communityStop').inputValue(),'','new location requires stop confirmation');assert.equal(await p.evaluate(()=>geoCalls),0);
  for(const light of [false,true]){await p.evaluate(light=>document.body.classList.toggle('day-mode',light),light);const axe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  console.log('PASS community',engine,width,language,'Home reuse, optional comment, pending/approved/expired, duplicates, busy guard, errors/offline, safe selection, themes and accessibility');await c.close();
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
