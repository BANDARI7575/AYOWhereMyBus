/* Official notice presentation and radius-scoped, source-labeled community summary. */
(function(root){
'use strict';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function selection(point,radius=.5){
 if(!point||!finite(point.latitude)||!finite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180)return null;
 if(!finite(radius)||radius<.1||radius>3)return null;
 return {latitude:point.latitude,longitude:point.longitude,radius,key:JSON.stringify([point.latitude,point.longitude,radius])};
}
function localReports(reports,stops,now=Date.now()/1000){
 const ids=new Set(stops.map(stop=>String(stop.stop_id)));
 return reports.filter(report=>report&&ids.has(String(report.stop_id))&&typeof report.text==='string'&&finite(report.created)&&report.created<=now+60&&finite(report.expires)&&Math.min(report.expires,report.created+86400)>now&&(report.state==null||report.state==='approved'));
}
const model={selection,localReports};
if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}
document.addEventListener('DOMContentLoaded',()=>{
 const count=document.getElementById('officialAlertCount'),state=document.getElementById('officialAlertState'),nearby=document.getElementById('nearbyAlertState');if(!count)return;
 let previousIds=null;
 const es=()=>document.documentElement.lang==='es',t=(a,b)=>es()?b:a;
 function update(){const data=window.AyoAlertStore?.snapshot;
  if(!data){count.textContent='—';state.textContent=t('Checking official notices…','Consultando avisos oficiales…');return;}
  const known=data.status==='fresh'||!!data.received_at;
  const rows=AyoTransit.normalizeAlerts(data.alerts);const ids=new Set(rows.map(a=>a.id).filter(Boolean));if(previousIds&&data.status==='fresh'){const cards=document.querySelectorAll('#alertsHost .service-alert');rows.forEach((a,i)=>{if(a.id&&!previousIds.has(a.id))cards[i]?.classList.add('alert-new');});}if(known)previousIds=ids;
  count.textContent=known?String(rows.length):'—';count.classList.toggle('has-value',known);
  const stamp=data.feed_timestamp||data.retrieved_at,age=Number.isFinite(stamp)?Date.now()/1000-stamp:Infinity;
  state.textContent=!known?t('Source unavailable','Fuente no disponible'):data.status==='fresh'&&age>=-60&&age<=180?t('Source current','Fuente actualizada'):t('Last known · check source time','Últimos datos · consulta la hora de origen');
 }
 const $=id=>document.getElementById(id),retry=$('refreshNearbyConditions'),panel=$('nearbyConditions');
 let selectedKey=null,stops=null,reports=null,stopAt=0,reportAt=0,stopError=false,reportError=false,loading=false,request=null,serial=0,debounce=null,lastAttempt=0,expiryTimer=null;
 let nearbySnapshot=null;root.AyoNearbySummary={get snapshot(){return nearbySnapshot;}};
 const current=()=>selection(root.AyoHome?.location||root.state?.selectedLocation,root.AyoHome?.radius??.5);
 const active=()=>root.AyoSite?.activeView==='alerts'&&!document.hidden;
 const fresh=stamp=>finite(stamp)&&Date.now()/1000-stamp>=-60&&Date.now()/1000-stamp<120;
 function row(host,value){const li=document.createElement('li');li.textContent=value;host.append(li);}
 function reset(){stops=null;reports=null;stopAt=reportAt=0;stopError=reportError=false;lastAttempt=0;}
 function synchronize(){
  const next=current(),key=next?.key??null;
  if(key!==selectedKey){request?.abort();serial++;loading=false;selectedKey=key;reset();}
  return next;
 }
 function render(){
  clearTimeout(expiryTimer);
  const selected=synchronize(),stopList=$('nearbyStopsList'),reportList=$('nearbyReportsList');
  stopList.replaceChildren();reportList.replaceChildren();
  panel.setAttribute('aria-busy',String(loading));retry.disabled=loading||!selected;
  nearbySnapshot={key:selected?.key??null,stops:stops||[],available:!!(selected&&stops&&!stopError&&fresh(stopAt)&&!loading&&navigator.onLine)};
  root.dispatchEvent(new CustomEvent('ayo:nearby-summary',{detail:nearbySnapshot}));
  $('nearbyStopCount').textContent=stops?String(stops.length):'—';
  const matched=stops&&reports?localReports(reports,stops):null;
  $('nearbyReportCount').textContent=matched?String(matched.length):'—';
  if(matched?.length){const expiry=Math.min(...matched.map(report=>Math.min(report.expires,report.created+86400)));expiryTimer=setTimeout(render,Math.max(1,Math.min(2147483647,expiry*1000-Date.now())));}
  if(!selected){
   nearby.textContent=t('Set your location on Home to see nearby stops.','Elige tu ubicación en Inicio para ver paradas cercanas.');
   $('nearbyReportState').textContent=t('Choose a location to check available reports.','Elige una ubicación para consultar los informes disponibles.');
   $('nearbyConditionsStatus').textContent=t('Use Home to allow location or choose a location manually. Alerts never requests location permission.','Usa Inicio para permitir la ubicación o elegirla manualmente. Avisos nunca solicita permiso de ubicación.');return;
  }
  const radius=new Intl.NumberFormat(es()?'es-US':'en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(selected.radius)+' mi';
  const unavailable=t('Unavailable. Retry the summary.','No disponible. Vuelve a consultar el resumen.');
  const loadingText=t('Loading nearby data…','Cargando datos cercanos…');
  const staleStops=stops&&(stopError||!fresh(stopAt)),staleReports=matched&&(reportError||!fresh(reportAt)||staleStops);
  nearby.textContent=stops?(staleStops?t('Last known stops','Últimas paradas conocidas'):t('MCTS GTFS stops','Paradas de MCTS GTFS'))+' · '+radius:loading?loadingText:unavailable;
  $('nearbyReportState').textContent=matched?(staleReports?t('Last known · unverified observations','Últimos datos · observaciones sin verificar'):t('Available approved reports · unverified','Informes aprobados disponibles · sin verificar')):loading?loadingText:unavailable;
  if(stops){
   if(!stops.length)row(stopList,t('No MCTS stops found within this radius.','No se encontraron paradas de MCTS en este radio.'));
   for(const stop of stops){const distance=root.AyoUnits?.distance(stop.distance_meters,es()?'es':'en');row(stopList,stop.name+' · '+t('Stop ','Parada ')+stop.stop_id+(distance&&distance!=='—'?' · '+distance:''));}
  }
  if(matched){
   if(!matched.length)row(reportList,t('No available approved reports for these stops. Conditions are unknown.','No hay informes aprobados disponibles para estas paradas. Se desconocen las condiciones.'));
   const names=new Map(stops.map(stop=>[String(stop.stop_id),stop.name]));
   for(const report of matched){const expires=new Date(Math.min(report.expires,report.created+86400)*1000).toLocaleString(es()?'es-US':'en-US',{timeZone:'America/Chicago',dateStyle:'short',timeStyle:'short'});row(reportList,names.get(String(report.stop_id))+' · '+(typeof report.category_labels?.[es()?'es':'en']==='string'?report.category_labels[es()?'es':'en']+' · ':'')+report.text+' · '+t('Expires ','Vence ')+expires+' America/Chicago');}
  }
  const knownAt=Math.min(...[stopAt,reportAt].filter(stamp=>stamp>0));
  $('nearbyConditionsStatus').textContent=loading?loadingText:stopError||reportError||staleStops||staleReports?t('Some data is unavailable or stale. Last-known observations are not current conditions. Retry to refresh.','Algunos datos no están disponibles o están desactualizados. Las últimas observaciones no son condiciones actuales. Vuelve a consultar.'):finite(knownAt)?t('Checked ','Consultado ')+new Date(knownAt*1000).toLocaleString(es()?'es-US':'en-US',{timeZone:'America/Chicago',dateStyle:'short',timeStyle:'short'})+' America/Chicago':'';
 }
 async function json(url,signal){
  const response=await fetch(url,{cache:'no-store',signal});
  if(!response.ok)throw Error('Nearby source unavailable');
  return response.json();
 }
 async function nearbyStops(selected,signal){
  const found=new Map();let offset=0,stamp=null;
  do{
   const query=new URLSearchParams({lat:selected.latitude,lon:selected.longitude,radius:selected.radius,offset});
   const data=await json('/api/explore/stops?'+query,signal);
   if(!Array.isArray(data.stops)||data.stops.some(stop=>!stop||typeof stop.name!=='string'||!stop.stop_id))throw Error('Invalid stop response');
   for(const stop of data.stops)found.set(String(stop.stop_id),stop);
   const retrieved=finite(data.retrieved_at)?data.retrieved_at:Date.now()/1000;stamp=stamp===null?retrieved:Math.min(stamp,retrieved);
   if(data.next_offset==null){if(finite(data.total)&&found.size<data.total)throw Error('Incomplete nearby stops');break;}
   if(!Number.isInteger(data.next_offset)||data.next_offset<=offset||data.next_offset>10000)throw Error('Invalid nearby pagination');
   offset=data.next_offset;
  }while(true);
  return {stops:[...found.values()],stamp};
 }
 async function refresh(force=false){
  const selected=synchronize();render();
  if(!selected||!active()||loading||(!force&&Date.now()-lastAttempt<60000))return;
  const generation=++serial,controller=request=new AbortController();loading=true;lastAttempt=Date.now();render();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const results=await Promise.allSettled([nearbyStops(selected,controller.signal),json('/api/winter/reports',controller.signal).then(data=>{if(!Array.isArray(data.reports))throw Error('Invalid report response');return data.reports;})]);
   if(generation!==serial||current()?.key!==selected.key)return;
   stopError=results[0].status==='rejected';reportError=results[1].status==='rejected';
   if(!stopError){stops=results[0].value.stops;stopAt=results[0].value.stamp;}
   if(!reportError){reports=results[1].value;reportAt=Date.now()/1000;}
  }finally{clearTimeout(timeout);if(generation===serial){loading=false;request=null;render();}}
 }
 function changed(){synchronize();render();clearTimeout(debounce);debounce=setTimeout(()=>refresh(true),250);}
 retry.onclick=()=>refresh(true);
 window.addEventListener('ayo:community-submitted',()=>refresh(true));
 window.addEventListener('ayo:location-selected',changed);
 window.addEventListener('ayo:radius-changed',changed);
 window.addEventListener('ayo:alerts-updated',update);
 window.addEventListener('ayo:screen-change',()=>{update();refresh();});
 window.addEventListener('online',()=>refresh(true));
 window.addEventListener('offline',()=>{stopError=reportError=true;render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
 let timer=null;
 function startTimer(){if(!timer)timer=setInterval(()=>{if(active()){render();refresh();}},30000);}
 window.addEventListener('pagehide',()=>{request?.abort();clearTimeout(debounce);clearTimeout(expiryTimer);clearInterval(timer);timer=null;});
 window.addEventListener('pageshow',()=>{startTimer();render();refresh();});startTimer();
 update();render();refresh();
});
})(typeof window!=='undefined'?window:globalThis);
