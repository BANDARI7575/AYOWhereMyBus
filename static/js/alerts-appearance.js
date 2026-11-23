/* Presentation only: observes the shared official snapshot; makes no API/GPS calls. */
'use strict';
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
 function location(){nearby.textContent=(window.AyoHome?.location||window.state?.selectedLocation)?t('Home location available · summary not loaded.','Ubicación de Inicio disponible · resumen sin cargar.'):t('Set location on Home · summary not loaded.','Elige ubicación en Inicio · resumen sin cargar.');}
 window.addEventListener('ayo:alerts-updated',update);window.addEventListener('ayo:location-selected',location);window.addEventListener('ayo:screen-change',()=>{update();location();});update();location();
});
