/* Supplied Founder design: scoped styles, honest destinations and mobile regressions. */
const {chromium,webkit}=require('playwright');
const {default:AxeBuilder}=require('@axe-core/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5001';
const reference=fs.readFileSync('tests/fixtures/founder-design.css','utf8').trim();
assert.ok(fs.readFileSync('static/css/style.css','utf8').includes(reference),'supplied design CSS is retained verbatim');
(async()=>{
 for(const [engine,type]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
  try{for(const width of [320,390,560,561,880,1440])for(const language of ['en','es']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   await context.addInitScript(lang=>localStorage.setItem('ayo-language',JSON.stringify(lang)),language);
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==new URL(base).origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({json:{schedule_active_today:true,feed_fresh:true,buses:[],status:'fresh',alerts:[],reports:[],routes:[],configured:false,live_voice_available:false}});return route.continue();});
   await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>AyoI18n.ready);await page.evaluate(()=>document.fonts.ready);
   const styleOf=selector=>page.locator(selector).evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {color:s.color,background:s.backgroundColor,font:s.fontFamily,size:s.fontSize,spacing:s.letterSpacing,padding:s.padding,border:s.borderRadius,direction:s.flexDirection,width:r.width};});
   const homeBefore=await styleOf('#homeTitle');
   await page.locator('#mobileMenuButton').click();await page.locator('a[href="#founder"]').click();
   const founder=page.locator('#founder');assert.equal(await founder.isVisible(),true);
   assert.match(await founder.innerText(),/Abhiraj Bandari/);assert.match(await founder.innerText(),/A Work Connect/);assert.match(await founder.innerText(),/Concordia University Wisconsin/);
   assert.equal(await founder.locator('.actions>a,.actions>button').count(),4);
   assert.equal(await founder.getByRole('link',{name:'GitHub',exact:true}).getAttribute('href'),'https://github.com/BANDARI7575');
   assert.equal(await founder.getByRole('link',{name:'LinkedIn',exact:true}).getAttribute('href'),'https://www.linkedin.com/in/abhiraj-bandari-83b50621b');
   assert.equal(await founder.getByRole('link',{name:language==='es'?'Contacto':'Contact',exact:true}).getAttribute('href'),'mailto:abhirajbandari632@gmail.com');
   const resume=founder.getByRole('button',{name:language==='es'?'Currículum · Próximamente':'Resume · Coming Soon',exact:true});assert.equal(await resume.isDisabled(),true);assert.equal(await resume.getAttribute('href'),null);
   assert.equal(await founder.locator('a[href="#"]').count(),0);assert.equal(await founder.locator('img').count(),0);
   assert.doesNotMatch(await founder.innerText(),/60 routes|4,000 stops|refreshes every 30 seconds|your-photo/);
   assert.match(await founder.locator('h3').first().innerText(),language==='es'?/ingeniería/:/engineering/);
   for(const theme of ['dark','light']){
    if(theme==='light')await page.evaluate(()=>document.body.classList.add('day-mode'));
    const card=await styleOf('#founder .card'),heading=await styleOf('#founder h2'),avatar=await styleOf('#founder .avatar'),root=await styleOf('#founder');
    assert.equal(card.background,'rgb(27, 30, 37)');assert.equal(card.border,'20px');assert.equal(card.padding,width<=560?'22px':'32px');
    assert.equal(root.color,'rgb(242, 243, 245)');assert.match(root.font,/DM Sans/);
    assert.equal(heading.size,width<=560?'24px':'28px');assert.equal(heading.spacing,'normal');
    assert.equal(avatar.width,88);assert.equal(avatar.color,'rgb(245, 184, 92)');
    assert.equal((await styleOf('#founder .head')).direction,width<=560?'column':'row');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    if([390,1440].includes(width)){const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
    if(process.env.AYO_FOUNDER_SHOTS&&language==='en'&&theme==='dark'&&[390,1440].includes(width)){fs.mkdirSync(process.env.AYO_FOUNDER_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.AYO_FOUNDER_SHOTS}/${engine}-${width}.png`,fullPage:true});}
   }
   await page.evaluate(()=>document.body.classList.remove('day-mode'));await page.locator('.app-nav [data-view=stops]').click();assert.deepEqual(await styleOf('#homeTitle'),homeBefore,'Founder styles do not change Home typography/layout');
   assert.deepEqual(errors,[]);console.log('PASS Founder',engine,language,width,'both themes, exact styling, links, disabled resume and scope');
   await context.close();
  }}finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
