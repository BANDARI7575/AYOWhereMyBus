const {chromium}=require('playwright');
const {default:AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs');
const base=process.env.AYO_TEST_URL||'http://127.0.0.1:5050';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.AYO_CHROME_PATH?{executablePath:process.env.AYO_CHROME_PATH}:{})});
 const results=[];
 try{
  for(const language of ['en','es'])for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();
   await page.addInitScript(lang=>localStorage.setItem('ayo-language',JSON.stringify(lang)),language);
   await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.js'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'text/javascript'});if(u.hostname==='unpkg.com'&&u.pathname.endsWith('leaflet.css'))return route.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'});return u.origin===base?route.continue():route.abort();});
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();
   for(const theme of ['dark','light']){
    if(theme==='light'){await page.locator('#themeButton').click();await page.reload({waitUntil:'domcontentloaded'});await page.locator('#planFrom').waitFor();}
    await page.evaluate(()=>window.AyoI18n.ready);await page.waitForTimeout(200);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    results.push({language,width,theme,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
    console.log(language,width,theme,JSON.stringify(results.at(-1).violations));
   }
   await context.close();
  }
 }finally{await browser.close();}
 if(process.env.AYO_AXE_REPORT)fs.writeFileSync(process.env.AYO_AXE_REPORT,JSON.stringify(results,null,2));
 if(results.some(r=>r.violations.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
