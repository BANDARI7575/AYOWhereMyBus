/* Complete app-owned text localization. Official names/reports are never machine-translated. */
(function(root){
'use strict';
let catalog={};
const normalize=s=>s.replace(/\s+/g,' ').trim();
function translate(text, language='es'){
 if(language!=='es')return text;
 const key=normalize(text);if(catalog[key])return text.replace(key,catalog[key])===text ? catalog[key] : text.replace(key,catalog[key]);
 const patterns=[
  [/^(\d+) buses$/,(_,n)=>`${n} autobuses`],
  [/^(\d+) seconds ago$/,(_,n)=>`hace ${n} segundos`],
  [/^(\d+) minutes ago$/,(_,n)=>`hace ${n} minutos`],
  [/^OLDEST KNOWN REPORT: (\d+) MIN$/,(_,n)=>`INFORME MÁS ANTIGUO: ${n} MIN`],
  [/^LAST REQUEST: (.+)$/,(_,time)=>`ÚLTIMA SOLICITUD: ${time}`],
  [/^(\d+) vehicle positions are old or have unknown timestamps\. Use caution\.$/,(_,n)=>`${n} ubicaciones son antiguas o no tienen hora. Ten precaución.`],
  [/^(\d+) reported buses within 3 km\. Use Rider tools for stops and verified arrival data\.$/,(_,n)=>`${n} autobuses informados en 3 km. Consulta las herramientas para paradas y llegadas verificadas.`],
  [/^(\d+) reported buses on Route (.+)\.$/,(_,n,r)=>`${n} autobuses informados en la ruta ${r}.`],
  [/^No reported buses found for Route (.+)\.$/,(_,r)=>`No se informaron autobuses en la ruta ${r}.`],
  [/^Searching Route (.+)\.\.\.$/,(_,r)=>`Buscando la ruta ${r}...`],
  [/^(\d+) nearest MCTS stops found\.$/,(_,n)=>`Se encontraron ${n} paradas cercanas de MCTS.`],
  [/^([\d.]+) (m|km) away$/,(_,n,u)=>`a ${n} ${u}`],
  [/^Stop (\S+)(.*)$/,(_,id,rest)=>`Parada ${id}${rest.replace(/([\d.]+) (m|km) away/, 'a $1 $2')}`],
  [/^AYO! · Route (.+)$/,(_,r)=>`AYO! · Ruta ${r}`],
  [/^Route (\S+) — (.+)$/,(_,r,name)=>`Ruta ${r} — ${name}`],
  [/^(North|Northeast|East|Southeast|South|Southwest|West|Northwest) (\(.*\))$/,(_,d,a)=>`${catalog[d]||d} ${a}`],
  [/^Bus (.+), Route (.+)$/,(_,b,r)=>`Autobús ${b}, ruta ${r}`],
  [/^Milwaukee weather: (.+) degrees Fahrenheit, (.+)$/,(_,temp,condition)=>`Clima de Milwaukee: ${temp} grados Fahrenheit, ${catalog[condition]||condition}`],
  [/^Milwaukee · (.+)°F · (.+)$/,(_,temp,condition)=>`Milwaukee · ${temp}°F · ${catalog[condition]||condition}`],
 ];
 for(const [pattern,replace]of patterns)if(pattern.test(key))return key.replace(pattern,replace);
 return text;
}
function apply(scope,document){
 if(document.documentElement.lang!=='es')return;
 const skip=n=>n.parentElement?.closest('script,style,textarea,[data-no-translate], [lang="en"]:not(html)');
 if(scope.nodeType===3){if(!skip(scope)){const old=scope.nodeValue,value=translate(old);if(value!==old)scope.nodeValue=value;}return;}
 if(scope.nodeType!==1)return;
 const visit=el=>{if(el.closest('[data-no-translate]'))return;for(const attr of ['aria-label','placeholder','title','alt'])if(el.hasAttribute(attr)){const old=el.getAttribute(attr),value=translate(old);if(value!==old)el.setAttribute(attr,value);}};
 visit(scope);scope.querySelectorAll('*').forEach(visit);
 const walk=document.createTreeWalker(scope,4);let n;while((n=walk.nextNode()))if(!skip(n)){const old=n.nodeValue,value=translate(old);if(value!==old)n.nodeValue=value;}
}
const api={translate,apply,load:data=>{catalog=data;}};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
 root.AyoI18n=api;
 api.ready=root.fetch('/static/es.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Translation catalog unavailable');return r.json();}).then(data=>{catalog=data;apply(root.document.documentElement,root.document);});
 // Retain language preference even on pages that don't load the tracker app.
 try{root.document.documentElement.lang=JSON.parse(root.localStorage.getItem('ayo-language')||'"en"')==='es'?'es':'en';}catch{}
 const manifest=root.document.querySelector('link[rel=manifest]');if(manifest&&root.document.documentElement.lang==='es')manifest.href='/static/manifest-es.webmanifest';
 root.document.addEventListener('DOMContentLoaded',()=>{
  api.ready.then(()=>{
   apply(root.document.documentElement,root.document);
   const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='characterData')apply(r.target,root.document);else if(r.type==='attributes')apply(r.target,root.document);else for(const n of r.addedNodes)apply(n,root.document);}});
   observer.observe(root.document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','title','alt']});
  }).catch(()=>{const p=root.document.createElement('p');p.setAttribute('role','alert');p.textContent='Language resources unavailable. Reload when connected. / Idioma no disponible. Recarga con conexión.';root.document.body.prepend(p);});
  const contact=root.document.querySelector('[data-support-contact]');
  if(contact)root.fetch('/api/status',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(typeof data.support_email==='string'&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(data.support_email)){const a=root.document.createElement('a');a.href='mailto:'+data.support_email;a.textContent=data.support_email;a.dataset.noTranslate='true';contact.append(a);}}).catch(()=>{});
  const button=root.document.getElementById('pageLanguageButton');
  if(button){button.textContent=root.document.documentElement.lang==='es'?'EN':'ES';button.onclick=()=>{try{root.localStorage.setItem('ayo-language',JSON.stringify(root.document.documentElement.lang==='es'?'en':'es'));root.location.reload();}catch{button.textContent='Storage unavailable / Almacenamiento no disponible';}};}
 });
}
})(typeof window!=='undefined'?window:globalThis);
