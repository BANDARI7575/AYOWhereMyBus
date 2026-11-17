/* Cinematic Founder: approved content, responsive composition, honest controls and scope. */
const {chromium,webkit}=require('playwright');
const {default:AxeBuilder}=require('@axe-core/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5098';
(async()=>{
 for(const [engine,type]of [['Chrome',chromium],['WebKit',webkit]]){
  const browser=await type.launch({headless:true,...(engine==='Chrome'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
  try{for(const width of [320,390,768,1440])for(const language of ['en','es']){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<=768,serviceWorkers:'block'});
   await context.addInitScript(lang=>localStorage.setItem('ayo-language',JSON.stringify(lang)),language);
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({json:{schedule_active_today:true,feed_fresh:true,buses:[],status:'fresh',alerts:[],reports:[],routes:[],configured:false,live_voice_available:false}});return route.continue();});
   await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>AyoI18n.ready);await page.evaluate(()=>document.fonts.ready);
   const homeStyle=()=>page.locator('#homeTitle').evaluate(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontFamily,s.color,s.letterSpacing];});const homeBefore=await homeStyle();
   await page.locator('#mobileMenuButton').click();await page.locator('a[href="#founder"]').click();
   const founder=page.locator('#founder');assert.equal(await founder.isVisible(),true);
   assert.equal(await founder.locator('#founder-name').innerText(),'ABHIRAJ\nBANDARI');
   assert.match(await founder.innerText(),/A Work Connect Private Limited/);assert.match(await founder.innerText(),/DPIIT/);assert.match(await founder.innerText(),/Concordia University Wisconsin/);
   assert.doesNotMatch(await founder.innerText(),/Senior Data Engineer|Jan 2021|Â|60 routes|4,000 stops|your-photo/);
   assert.equal(await founder.locator('.actions>a,.actions>button').count(),4);
   for(const [name,url]of [['GitHub','https://github.com/BANDARI7575'],['LinkedIn','https://www.linkedin.com/in/abhiraj-bandari-83b50621b']]){const a=founder.getByRole('link',{name,exact:true});assert.equal(await a.getAttribute('href'),url);assert.equal(await a.getAttribute('target'),'_blank');assert.match(await a.getAttribute('rel'),/noopener/);}
   assert.equal(await founder.getByRole('link',{name:language==='es'?'Contacto':'Contact',exact:true}).getAttribute('href'),'mailto:abhirajbandari632@gmail.com');
   const resume=founder.getByRole('button',{name:language==='es'?'Currículum · Próximamente':'Resume · Coming Soon',exact:true});assert.equal(await resume.isDisabled(),true);assert.equal(await resume.getAttribute('href'),null);
   assert.equal(await founder.locator('a[href="#"]').count(),0);
   const img=founder.locator('img');assert.equal(await img.count(),1);assert.equal(await img.getAttribute('src'),'/static/img/founder-leaning.png');await img.evaluate(n=>n.decode());assert.equal(await img.evaluate(n=>n.complete&&n.naturalWidth>0),true);assert.ok((await img.getAttribute('alt')).length>15);
   assert.equal(await founder.locator('.pipeline .step').count(),4);assert.equal(await founder.locator('.chip').count(),16);
   assert.match(await founder.locator('h3').first().innerText(),language==='es'?/ingeniería/:/engineering/);
   assert.match(await founder.locator('.founder-mission').innerText(),language==='es'?/MENOS ESPERA/:/LESS WAITING/);
   assert.equal(await founder.locator('.fine').evaluate(n=>!!(n.compareDocumentPosition(document.querySelector('.founder-mission'))&Node.DOCUMENT_POSITION_PRECEDING)),true);
   // Lamp, shade, underside and beam share one swinging ancestor: synchronization is structural.
   assert.equal(await founder.locator('.founder-light .founder-lamp .founder-illumination').count(),1);
   await page.waitForTimeout(1700);
   const before=await founder.locator('.founder-light').evaluate(n=>getComputedStyle(n).transform);await page.waitForTimeout(150);const after=await founder.locator('.founder-light').evaluate(n=>getComputedStyle(n).transform);assert.notEqual(before,after,'lamp moves naturally');
   assert.equal(await founder.locator('.founder-light').evaluate(n=>getComputedStyle(n).animationDuration),'8s');
   const bio=await founder.locator('.founder-biography').evaluate(n=>{const s=getComputedStyle(n);return {text:n.textContent,font:s.fontFamily,style:s.fontStyle,weight:s.fontWeight,size:parseFloat(s.fontSize),line:parseFloat(s.lineHeight)/parseFloat(s.fontSize),border:s.borderLeftWidth,max:s.maxWidth};});
   assert.equal(bio.style,'normal');assert.equal(bio.weight,'400');assert.equal(bio.size,width<=560?16:18);assert.ok(bio.line>=1.65&&bio.line<=1.75);assert.equal(bio.border,'2px');assert.match(bio.font,/DM Sans/);
   if(language==='en')assert.equal(bio.text,"I build data pipelines for a living and products for fun. I co-founded A Work Connect Private Limited, a DPIIT-recognized startup in India, and learned most of what I know about data engineering building it. I built AYO! because Milwaukee riders shouldn't have to wait in freezing weather without knowing when the bus is coming.");
   const swing=await founder.locator('.founder-light').evaluate(n=>{const a=n.getAnimations()[0],svg=n.querySelector('svg');a.pause();const sample=time=>{a.currentTime=time;const m=svg.getScreenCTM(),p=new DOMPoint(300,0).matrixTransform(m),q=new DOMPoint(300,266).matrixTransform(m),matrix=new DOMMatrix(getComputedStyle(n).transform);return {x:p.x,y:p.y,bottom:q.x,angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI};};const left=sample(0),right=sample(4000);a.play();return {left,right};});
   assert.ok(Math.abs(swing.left.angle+(width<=560?4:6))<.1);assert.ok(Math.abs(swing.right.angle-(width<=560?4:6))<.1);assert.ok(Math.abs(swing.left.x-swing.right.x)<.1&&Math.abs(swing.left.y-swing.right.y)<.1,'actual cable suspension stays fixed');assert.ok(Math.abs(swing.left.bottom-swing.right.bottom)>30,'lamp underside visibly travels sideways');
   for(const theme of ['dark','light']){
    if(theme==='light')await page.evaluate(()=>document.body.classList.add('day-mode'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    const geometry=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),name=r('#founder-name span'),image=r('.founder-character img'),scene=r('.founder-scene'),font=parseFloat(getComputedStyle(document.querySelector('#founder-name')).fontSize);return {elbowX:image.left+image.width*365/1199,elbowY:image.top+image.height*430/1312,targetX:name.right,targetY:name.top+font*.18,bodyLeft:image.left+image.width*.43,contained:image.left>=scene.left&&image.right<=scene.right&&image.bottom<=scene.bottom};});assert.ok(Math.abs(geometry.elbowX-geometry.targetX)<2,'resting elbow meets BANDARI right edge');assert.ok(Math.abs(geometry.elbowY-geometry.targetY)<2,'elbow rests at BANDARI ink top');assert.ok(geometry.bodyLeft>geometry.targetX,'torso stays clear of lettering');assert.equal(geometry.contained,true,'full figure remains in scene');

    if([390,1440].includes(width)){const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
    if(language==='en'&&theme==='dark'&&[390,1440].includes(width)){fs.mkdirSync('/private/tmp/ayo-founder-lean-shots',{recursive:true});await page.screenshot({path:`/private/tmp/ayo-founder-lean-shots/${engine}-${width}.png`,fullPage:true});}
   }
   await page.emulateMedia({reducedMotion:'reduce'});for(const s of ['.founder-light','.founder-illumination','.founder-character','.founder-scene'])assert.equal(await founder.locator(s).evaluate(n=>getComputedStyle(n).animationName),'none');
   // Actual keyboard focus and retained control click behavior without opening external services.
   const github=founder.getByRole('link',{name:'GitHub',exact:true});await github.focus();assert.equal(await github.evaluate(n=>n===document.activeElement),true);
   if(engine==='Chrome'){await page.keyboard.press('Tab');assert.equal(await founder.getByRole('link',{name:'LinkedIn',exact:true}).evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await founder.getByRole('link',{name:language==='es'?'Contacto':'Contact',exact:true}).evaluate(n=>n===document.activeElement),true);}
   // WebKit's default platform Tab preference skips anchors; Enter still activates native links.
   for(const name of ['GitHub','LinkedIn']){const link=founder.getByRole('link',{name,exact:true});await link.focus();assert.equal(await link.evaluate(n=>n===document.activeElement),true);const pending=page.waitForEvent('popup');await page.keyboard.press('Enter');const popup=await pending;await popup.close();}

   await founder.locator('.fine').scrollIntoViewIfNeeded();const clear=await founder.locator('.fine').evaluate(n=>n.getBoundingClientRect().bottom<=document.querySelector('.app-nav').getBoundingClientRect().top);assert.equal(clear,true,'disclaimer above bottom nav');
   await page.evaluate(()=>document.body.classList.remove('day-mode'));for(const v of ['stops','trip','alerts','saved']){await page.locator(`.app-nav [data-view=${v}]`).click();await page.waitForFunction(view=>AyoSite.activeView===view,v);}
   await page.locator('.app-nav [data-view=stops]').click();assert.deepEqual(await homeStyle(),homeBefore,'Founder styles do not affect Home');
   const ai=page.locator('.app-nav a[href="/ai"]');assert.equal(await ai.count(),1);await ai.click();await page.waitForURL('**/ai');assert.equal(await page.locator('h1').count(),1);
   assert.deepEqual(errors,[]);console.log('PASS cinematic Founder',engine,language,width,'content, full-body asset, synchronized motion, links, keyboard, navigation, themes, layout and reduced motion');
   await context.close();
  }}finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
