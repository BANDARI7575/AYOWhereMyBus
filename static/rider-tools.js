/* Integrated rider tools. All upstream and rider text is rendered as text. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
const el=id=>document.getElementById(id);
const es=()=>document.documentElement.lang==='es';
const t=(en,spanish)=>es()?spanish:en;
const node=(tag,text,parent)=>{const n=document.createElement(tag);n.textContent=text;if(parent)parent.append(n);return n;};
const pending=new Map();
function api(path,body){if(!body&&pending.has(path))return pending.get(path);const job=(async()=>{const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});let d;try{d=await r.json();}catch{throw Error(t('Service temporarily unavailable. Try again later.','Servicio no disponible. Inténtalo más tarde.'));}if(!r.ok)throw Error(d.message||'Unavailable');return d;})();if(!body)pending.set(path,job);return job.finally(()=>{if(pending.get(path)===job)pending.delete(path);});}

function button(parent,en,spanish,fn){const b=node('button',t(en,spanish),parent);b.type='button';b.className='favorite-chip';b.dataset.en=en;b.dataset.es=spanish;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){(parent.closest('.winter-panel')?.querySelector('[role=status]')||el('riderStatus')).textContent=e.message;}finally{b.disabled=false;}};return b;}
function input(parent,id,en,spanish){const field=node('div','',parent);field.className='field';const label=node('label',t(en,spanish),field);label.htmlFor=id;label.dataset.en=en;label.dataset.es=spanish;const n=node('input','',field);n.id=id;return n;}
let pushConfig=null;api('/api/push/config').then(data=>pushConfig=data).catch(()=>{});
let watch=null,shapeLayer=null,selectedMarker=null;
const tools=el('riderTools');
const title=node('h2',t('Search stops','Buscar paradas'),tools);title.id='stopSearchTitle';
const searchForm=node('form','',tools);searchForm.className='search-stops';
const query=input(searchForm,'stopQuery','Search stops','Buscar paradas');query.type='search';query.placeholder=t('Stop name or ID','Nombre o ID de parada');query.autocomplete='off';
const matches=node('div','',tools);matches.className='stop-matches';const detail=node('div','',tools);detail.className='stop-detail';
const status=node('p','',tools);status.id='riderStatus';status.setAttribute('role','status');
const saved=node('div','',tools);
function favoriteStops(){try{const ids=JSON.parse(localStorage.getItem('ayo-stops')||'[]');return Array.isArray(ids)?ids.filter(x=>typeof x==='string'&&/^\d{1,12}$/.test(x)):[];}catch{return [];}}
window.addEventListener('ayo:favorites-changed',()=>favorites());
function favorites(){saved.replaceChildren();const ids=favoriteStops();for(const id of ids)button(saved,`Stop ${id}`,`Parada ${id}`,()=>loadStop(id));}
const searchButton=button(searchForm,'Search','Buscar',async()=>{const d=await api('/api/stops/search?q='+encodeURIComponent(query.value));matches.replaceChildren();for(const s of d.stops)button(matches,`${s.stop_id} · ${s.stop_name}`,`${s.stop_id} · ${s.stop_name}`,()=>loadStop(s.stop_id));if(!d.stops.length)node('p',t('No stops found','No se encontraron paradas'),matches);});
searchButton.type='submit';searchForm.addEventListener('submit',event=>event.preventDefault());
let selectedStop=null,stopVersion=0;
async function loadStop(id){if(typeof id!=='string'||!/^\d{1,12}$/.test(id))throw Error(t('Choose a valid stop','Elige una parada válida'));const version=++stopVersion;selectedStop=id;detail.replaceChildren();const heading=node('h3',t('Next arrivals','Próximas llegadas'),detail);const selectedName=node('p',t('Stop ','Parada ')+id,detail);const actions=node('details','',detail);node('summary',t('Stop actions','Opciones de parada'),actions);const controls=node('div','',actions);controls.className='stop-tools';const arrivals=node('div','',detail);arrivals.id='selectedArrivals';
window.dispatchEvent(new CustomEvent('ayo:stop-selected',{detail:{id}}));
button(controls,'Save / remove favorite','Guardar / quitar favorito',async()=>{if(window.AyoWorkspaces){await AyoWorkspaces.toggleStopFavorite(id);favorites();return;}let ids=favoriteStops();ids=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];localStorage.setItem('ayo-stops',JSON.stringify(ids));window.dispatchEvent(new Event('ayo:favorites-changed'));favorites();});
button(controls,'Read departures · AYO Voice','Leer salidas · AYO Voice',async()=>{const d=await api(`/api/stops/${id}/departures`);const text=departureText(d);if(!('speechSynthesis' in window))throw Error(t('Speech unavailable; read the departure list.','Voz no disponible; lea las salidas.'));speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=es()?'es-US':'en-US';u.onerror=()=>status.textContent=t('Voice playback failed. Read the departures shown on screen.','La reproducción de voz falló. Lee las salidas en pantalla.');speechSynthesis.speak(u);});
button(controls,'Stop reading','Detener lectura',()=>{window.speechSynthesis?.cancel();});
button(controls,'Enable arrival alert (keep page open)','Activar aviso (mantenga la página abierta)',async()=>{if(!('Notification'in window))throw Error(t('Browser notifications unavailable.','Avisos no disponibles.'));if(await Notification.requestPermission()!=='granted')throw Error(t('Notification permission required.','Se requiere permiso.'));watch={id,sent:new Set(),expires:Date.now()+86400000};status.textContent=t('Watching verified predictions only; keep this page open.','Solo predicciones verificadas; mantenga esta página abierta.');});
button(controls,'Watch next arrival in background','Avisar de la próxima llegada en segundo plano',async()=>{
 if(!pushConfig?.configured)throw Error(t('Background alerts require operator setup','Los avisos en segundo plano requieren configuración del operador'));
 if(pushConfig.available===false)throw Error(t('Background alert worker is unavailable. Try again later.','Los avisos en segundo plano no están disponibles. Inténtalo más tarde.'));
 if(!('PushManager'in window)||!('serviceWorker'in navigator)||!('Notification'in window))throw Error(t('Background alerts are not supported in this browser. On iPhone, install AYO first.','Este navegador no admite avisos en segundo plano. En iPhone, instala AYO primero.'));
 if(await Notification.requestPermission()!=='granted')throw Error(t('Notification permission required.','Se requiere permiso de notificaciones.'));
 const reg=await navigator.serviceWorker.ready;if(reg.waiting)throw Error(t('Update AYO and reload before enabling background alerts.','Actualiza AYO y recarga antes de activar los avisos.'));
 const raw=pushConfig.public_key.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(raw+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
 const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await api('/api/push/subscribe',{subscription:subscription.toJSON(),stop_id:id,language:es()?'es':'en',consent:true});
 status.textContent=t('Watching the next verified arrival at this stop for up to 24 hours. Delivery depends on your device and network.','Se avisará de la próxima llegada verificada hasta 24 horas. La entrega depende del dispositivo y la red.');
});
button(controls,'Stop background alerts','Desactivar avisos en segundo plano',async()=>{await api('/api/push/unsubscribe',{});const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe();status.textContent=t('Background alerts stopped.','Avisos en segundo plano desactivados.');});
async function updateArrivals(){
 const d=await api(`/api/stops/${id}/departures`);if(version!==stopVersion)return;
 arrivals.replaceChildren();
 node('p',d.realtime_status==='fresh'?t('Fresh trip-update feed. Times below are labeled by source.','Datos de viajes actualizados. Cada hora indica su fuente.'):t('Live predictions unavailable. Scheduled times are shown when available.','Predicciones no disponibles. Se muestran horarios programados cuando existen.'),arrivals).className='status-note';
 const list=node('ul','',arrivals);list.className='arrival-list';
 const now=Date.now()/1000;
 const rows=d.departures.filter(dep=>{const p=AyoTransit.departureState(dep,d.realtime_status,now);return p.epoch==null||p.epoch>=now;}).slice(0,5);
 if(!rows.length)node('p',t('No upcoming departures returned. Check the official planner for other service.','No se devolvieron salidas próximas. Consulta otros servicios en el planificador oficial.'),arrivals);
 for(const dep of rows){
  const p=AyoTransit.departureState(dep,d.realtime_status,now),row=node('li','',list);row.className='arrival-card';node('span',dep.route_number||dep.route_id||'—',row).className='route-badge';
  const destination=node('div','',row);node('p',dep.trip_headsign||t('Direction not supplied','Sentido no indicado'),destination);
  if(dep.realtime_warning)node('p',t('Service change reported; check official alerts.','Cambio de servicio informado; consulta los avisos.'),destination).className='arrival-warning';
  const when=node('div','',row);when.className='arrival-when';node('div',p.epoch?new Date(p.epoch*1000).toLocaleTimeString(es()?'es-US':'en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}):'—',when).className='arrival-time';
  node('div',({arrival:t('Predicted arrival','Llegada estimada'),departure:t('Predicted departure','Salida estimada'),scheduled:t('Scheduled','Programado'),canceled:t('Canceled','Cancelado'),unknown:t('Unknown arrival','Llegada desconocida')})[p.kind],when).className='arrival-label';
  const rowActions=node('div','',row);rowActions.className='arrival-controls';
  button(rowActions,'Route on map','Ruta en mapa',async()=>{const data=await api('/api/routes/'+encodeURIComponent(dep.route_id)+'/shape');if(!window.state?.map||!window.L)throw Error(t('Map unavailable','Mapa no disponible'));window.AyoSite?.navigate('map');if(shapeLayer)shapeLayer.remove();shapeLayer=L.featureGroup(data.shapes.filter(points=>points.length).map(points=>L.polyline(points,{color:'#e9b75e',weight:4}))).addTo(state.map);if(data.shapes.length&&shapeLayer.getBounds().isValid())state.map.fitBounds(shapeLayer.getBounds());});
 }
}
window.AyoRiderTools.refresh=updateArrivals;
await updateArrivals();
const stops=await api('/api/stops/search?q='+encodeURIComponent(id));if(version!==stopVersion)return;const s=stops.stops.find(x=>x.stop_id===id);
if(s){selectedName.textContent=s.stop_name+' · '+t('Stop ','Parada ')+id;const a=node('a',t('Walking directions (external map)','Cómo llegar a pie (mapa externo)'),detail);a.href=`https://www.google.com/maps/dir/?api=1&destination=${Number(s.stop_lat)},${Number(s.stop_lon)}&travelmode=walking`;a.target='_blank';a.rel='noopener noreferrer';a.className='official-link';if(window.state?.map&&window.L){if(selectedMarker)selectedMarker.remove();selectedMarker=L.circleMarker([Number(s.stop_lat),Number(s.stop_lon)]).addTo(state.map).bindPopup(node('span',s.stop_name));}}
}
window.AyoRiderTools={get selectedStopId(){return selectedStop;},refresh:null,invalidate(){const box=el('selectedArrivals');if(box)box.replaceChildren(node('p',t('Current arrivals unavailable. Reconnect to refresh.','Llegadas actuales no disponibles. Conéctate para actualizar.')));}};

function format(d,status='fresh'){const p=AyoTransit.departureState(d,status);return `${d.route_number||d.route_id} → ${d.trip_headsign} · ${p.epoch?new Date(p.epoch*1000).toLocaleTimeString(es()?'es-US':'en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}):'—'} · ${({arrival:t('Arrival prediction','Llegada estimada'),departure:t('Departure prediction','Salida estimada'),scheduled:t('Scheduled','Programado'),canceled:t('Canceled','Cancelado'),unknown:t('Unknown arrival','Llegada desconocida')})[p.kind]}`;}

function departureText(d){return d.departures.length?d.departures.slice(0,5).map(dep=>format(dep,d.realtime_status)).join('. '):t('No departures in the next two hours. Schedule coverage may be unavailable.','No hay salidas en dos horas. El horario puede no estar disponible.');}
setInterval(async()=>{if(document.hidden||!navigator.onLine)return;if(selectedStop)window.AyoRiderTools.refresh?.().catch(()=>{status.textContent=t('Arrivals could not refresh. Previously shown times may be outdated.','No se actualizaron las llegadas. Las horas anteriores pueden estar desactualizadas.');const box=el('selectedArrivals');if(box)box.replaceChildren(node('p',status.textContent));});if(!watch)return;if(Date.now()>=watch.expires){watch=null;return;}try{const d=await api(`/api/stops/${watch.id}/departures`);for(const a of d.departures){const key=a.trip_id+a.service_date;const delta=a.prediction_at-Date.now()/1000;if(['arrival','departure'].includes(AyoTransit.departureState(a,d.realtime_status).kind)&&delta>0&&delta<=300&&!watch.sent.has(key)){new Notification('AYO!',{body:format(a)});watch.sent.add(key);watch=null;break;}}}catch{}},30000);
window.addEventListener('pagehide',()=>window.speechSynthesis?.cancel());window.addEventListener('offline',()=>window.speechSynthesis?.cancel());
window.ayoLoadStop=id=>loadStop(id).catch(e=>status.textContent=e.message);
favorites();const initialStop=favoriteStops()[0];if(initialStop)window.ayoLoadStop(initialStop);
const official=node('a',t('Official MCTS planner for addresses and more options','Planificador oficial MCTS para direcciones y más opciones'),tools);official.href='https://www.ridemcts.com/trip-planner';official.target='_blank';official.rel='noopener noreferrer';official.className='official-link';
const winterRoot=el('winter-watch');if(winterRoot&&!winterRoot.hidden){
const winter=winterRoot.querySelector('.winter-panel');winter.replaceChildren();node('h3','Winter Watch',winter);node('p',t('Anonymous, unverified rider reports. Text only; no names, contact details or links. Moderated before publication; expires after 24 hours.','Informes anónimos sin verificar. Solo texto; sin datos personales ni enlaces. Revisión antes de publicar; caducan en 24 horas.'),winter);
const winterStatus=node('p','',winter);winterStatus.id='winterStatus';winterStatus.setAttribute('role','status');
const stop=input(winter,'winterStop','Stop ID','Número de parada');const label=node('label',t('Conditions (10–500 characters)','Condiciones (10–500 caracteres)'),winter);label.htmlFor='winterText';const text=node('textarea','',winter);text.id='winterText';text.maxLength=500;
button(winter,'Submit for moderation','Enviar para revisión',async()=>{const d=await api('/api/winter/reports',{stop_id:stop.value,text:text.value});winterStatus.textContent=t(d.message,'Enviado para revisión; caduca en 24 horas.');text.value='';});const reports=node('div','',winter);
async function refreshReports(){const d=await api('/api/winter/reports');reports.replaceChildren();if(!d.reports.length)node('p',t('No approved active reports.','No hay informes activos aprobados.'),reports);for(const r of d.reports.filter(r=>r.expires>Date.now()/1000)){const n=node('article','',reports);node('p',`${r.stop_id} · ${r.text} · ${r.votes}`,n).dataset.noTranslate='true';for(const value of [1,-1])button(n,value===1?'Confirm':'Disagree',value===1?'Confirmar':'No coincide',async()=>{await api(`/api/winter/reports/${r.id}/vote`,{value});await refreshReports();});const label=node('label',t('Report a problem','Informar de un problema'),n);const reason=node('select','',label);for(const [value,en,spanish]of [['spam','Spam','Correo no deseado'],['personal_info','Personal information','Información personal'],['unsafe','Unsafe content','Contenido peligroso'],['incorrect','Incorrect condition','Condición incorrecta'],['other','Other','Otro']]){const option=node('option',t(en,spanish),reason);option.value=value;}button(n,'Flag for review','Marcar para revisión',async()=>{await api(`/api/winter/reports/${r.id}/flag`,{reason:reason.value});winterStatus.textContent=t('Flag sent to moderators.','Aviso enviado a moderación.');await refreshReports();});}}
button(winter,'Refresh reports','Actualizar informes',refreshReports);const reportsUnavailable=()=>{reports.textContent=t('Reports unavailable. Try again later.','Informes no disponibles. Inténtalo más tarde.');};refreshReports().catch(reportsUnavailable);setInterval(()=>refreshReports().catch(reportsUnavailable),60000);
}
const alerts=node('details','',el('homeAlertsHost'));alerts.id='serviceAlerts';alerts.className='panel';node('h4',t('MCTS service alerts','Avisos de MCTS'),alerts);
async function refreshAlerts(){await AyoAlertStore.refresh();AyoAlertStore.bind(alerts,window.state?.route||'');}
window.addEventListener('ayo:route-selected',()=>AyoAlertStore.bind(alerts,window.state?.route||''));
refreshAlerts();setInterval(refreshAlerts,60000);window.addEventListener('online',refreshAlerts);


const connection=node('p','',tools);connection.setAttribute('role','status');const updateConnection=()=>{connection.textContent=navigator.onLine?'':t('Offline: live transit data and new journeys require a connection. Previously displayed times may be outdated.','Sin conexión: los datos en vivo y nuevos viajes requieren conexión. Los horarios anteriores pueden estar desactualizados.');};window.addEventListener('offline',updateConnection);window.addEventListener('online',updateConnection);updateConnection();
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
api('/api/status').then(d=>{if(!d.schedule_active_today)status.textContent=t('Schedule does not cover today. Departures and planning may be unavailable.','El horario no cubre hoy. Salidas y planificación pueden no estar disponibles.');}).catch(e=>status.textContent=e.message);
});
