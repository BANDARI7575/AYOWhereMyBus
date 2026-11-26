/* Home stop finder. Production data is always sourced from the existing APIs. */
(function(root){
'use strict';
const transit=typeof module!=='undefined'&&module.exports?require('./transit-ui.js'):root.AyoTransit;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validPoint=p=>p&&finite(p.latitude)&&finite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
const age=(stamp,now)=>finite(stamp)&&stamp>0&&now-stamp>=-60?Math.max(0,now-stamp):Infinity;
const key=d=>[d.trip_id,d.service_date,d.stop_sequence].join('|');
function sourceStatus(data,now=Date.now()/1000){return data?.realtime_status==='fresh'&&age(data.feed_timestamp,now)<=180?'fresh':'unavailable';}
function ordered(data,now=Date.now()/1000){return(Array.isArray(data?.departures)?data.departures:[]).map(d=>({...d,presentation:transit.departureState(d,sourceStatus(data,now),now)})).filter(d=>d.presentation.epoch===null||d.presentation.epoch>=now).sort((a,b)=>(a.presentation.epoch??Infinity)-(b.presentation.epoch??Infinity)||key(a).localeCompare(key(b)));}
function countdown(d,status,now=Date.now()/1000,es=false){const p=transit.departureState(d,status,now);if(p.kind==='canceled')return es?'Cancelado':'Canceled';if(!finite(p.epoch)||p.epoch<now)return '—';const minutes=Math.ceil((p.epoch-now)/60);return minutes===0?(es?'Ahora':'Due'):`${minutes} min`;}
function vehicleFor(departure,data,now=Date.now()/1000){
 if(!departure||departure.canceled||!data?.feed_fresh||age(data.feed_timestamp,now)>180||!/^\d{8}$/.test(departure.service_date||''))return null;
 const matches=(Array.isArray(data.buses)?data.buses:[]).filter(bus=>validPoint(bus)&&(bus.trip_schedule_relationship==null||bus.trip_schedule_relationship===0)&&bus.trip_id&&bus.trip_id===departure.trip_id&&String(bus.route).toUpperCase()===String(departure.route_id).toUpperCase()&&(bus.trip_start_date?bus.trip_start_date===departure.service_date:bus.qualified_service_date===departure.service_date&&bus.service_date_basis==='unique_active_gtfs_occurrence')&&age(bus.reported_at,now)<=120&&(bus.direction_id==null||departure.direction_id==null||String(bus.direction_id)===String(departure.direction_id)));
 return matches.length===1?matches[0]:null;
}
function vehicleUnavailableMessage(reason,t){
 switch(reason){
  case 'vehicle_not_reported':
   return t('MCTS has no vehicle position for this trip in its latest feed. Arrival predictions come from a separate feed.','MCTS no informa la posición de un vehículo para este viaje en su última actualización. Las predicciones de llegada provienen de otra fuente.');
  case 'stale_vehicle_feed':
   return t('MCTS vehicle positions are out of date. The map will retry while it is open.','Las posiciones de los vehículos de MCTS están desactualizadas. Se volverán a consultar mientras el mapa esté abierto.');
  case 'vehicle_feed_unavailable':
   return t('MCTS vehicle locations are temporarily unavailable.','Las ubicaciones de los vehículos de MCTS no están disponibles por el momento.');
  case 'stale_vehicle_position':
   return t('MCTS has no recent GPS update for this bus.','MCTS no tiene una actualización reciente del GPS de este autobús.');
  case 'vehicle_route_mismatch':
   return t('The reported bus location is for a different route.','La posición informada corresponde a otra ruta.');
  case 'vehicle_direction_mismatch':
   return t('The reported bus location is for a different direction.','La posición informada corresponde a otro sentido de viaje.');
  case 'vehicle_service_date_mismatch':
   return t('The reported bus location could not be verified for this trip’s service date.','No se pudo verificar la posición informada para la fecha de servicio de este viaje.');
  case 'ambiguous_vehicle_match':
   return t('MCTS reported more than one possible bus for this trip.','MCTS informó de más de un autobús posible para este viaje.');
  case 'vehicle_trip_unverified':
   return t('The reported bus location could not be verified for this scheduled trip.','No se pudo verificar la posición informada para este viaje programado.');
  default:
   return t('No reliably matched current vehicle is available for this trip. Vehicle positions may be stale or missing.','No hay un vehículo actual asociado de forma fiable con este viaje. Las posiciones pueden ser antiguas o faltar.');
 }
}
function walkingWarning(walk,departure,data,now=Date.now()/1000){if(!walk||walk.verified!==true||walk.mode!=='walking'||!walk.source||!finite(walk.duration_seconds)||walk.duration_seconds<0||age(walk.retrieved_at,now)>300)return false;const p=transit.departureState(departure,sourceStatus(data,now),now);return ['arrival','departure'].includes(p.kind)&&p.epoch>now&&walk.duration_seconds>p.epoch-now;}
function walkingURLs(origin,stop){if(!validPoint(origin)||!validPoint(stop))return null;const start=`${origin.latitude},${origin.longitude}`,end=`${stop.latitude},${stop.longitude}`;return {google:'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:start,destination:end,travelmode:'walking'}),apple:'https://maps.apple.com/?'+new URLSearchParams({saddr:start,daddr:end,dirflg:'w'})};}
const model={validPoint,age,key,sourceStatus,ordered,countdown,vehicleFor,walkingWarning,walkingURLs};
if(typeof module!=='undefined'&&module.exports){module.exports=model;return;}
root.AyoHomeModel=model;
document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id);if(!$('homeWelcome'))return;
 const es=()=>document.documentElement.lang==='es',t=(en,sp)=>es()?sp:en;
 const text=(tag,value,parent,cls)=>{const el=document.createElement(tag);if(value!=null)el.textContent=value;if(cls)el.className=cls;if(parent)parent.append(el);return el;};
 const button=(parent,label,fn,cls='home-secondary')=>{const b=text('button',label,parent,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){status(error.message);}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const S={screen:'welcome',location:null,radius:.5,rows:[],next:null,total:0,shown:5,stop:null,arrivals:null,arrivalError:false,arrivalsAt:0,previewAt:0,version:0,stopVersion:0,searchVersion:0,listY:0,request:null,pendingArrivals:false,live:null,timer:null,selectedDeparture:null,locationIntent:0,arrivalController:null,openIntent:0,previews:new Map()};
 const legacyLoad=root.ayoLoadStop;
 let radiusDelay=null,smokeDelay=null;
 function status(message=''){ $('homeStatus').textContent=message; }
 function time(epoch){return finite(epoch)?new Date(epoch*1000).toLocaleTimeString(es()?'es-US':'en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',second:'2-digit'}):t('Timestamp unavailable','Hora de origen no disponible');}
 function saveMode(mode){try{localStorage.setItem('ayo-home-location-mode',mode);}catch{}}
 function mode(){try{return localStorage.getItem('ayo-home-location-mode');}catch{return null;}}
 async function api(url,{signal}={}){
  const controller=new AbortController(),cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,12000);
  try{const r=await fetch(url,{cache:'no-store',signal:controller.signal});let data;try{data=await r.json();}catch{throw Error(t('Service data is unavailable. Please retry.','Los datos no están disponibles. Vuelve a intentar.'));}if(!r.ok)throw Error(r.status===429?t('Too many requests. Wait a moment and retry.','Demasiadas solicitudes. Espera un momento y vuelve a intentar.'):data.message||t('Service unavailable. Please retry.','Servicio no disponible. Vuelve a intentar.'));return data;
  }catch(error){if(signal?.aborted)throw error;throw Error(!navigator.onLine?t('Offline. Reconnect and retry.','Sin conexión. Conéctate y vuelve a intentar.'):error.name==='AbortError'?t('Request timed out. Please retry.','La solicitud tardó demasiado. Vuelve a intentar.'):error.message||t('Network unavailable. Please retry.','Red no disponible. Vuelve a intentar.'));}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
 }
 let walking=null;
 function closeWalking(){
  const note=$('homeWalkingDuration');
  if(note)note.textContent=t('Select Walk to This Stop to check walking time.','Selecciona Caminar hasta esta parada para consultar la duración.');
  const w=walking;if(!w)return;walking=null;w.controller.abort();w.map?.remove();w.shell.remove();}
 function addWalkingRoute(host){
  const shell=text('section',null,host,'home-live-shell');
  text('p',t('To request a walking route, share your selected location and the stop’s coordinates with Geoapify. Map tiles identify the area you view.','Para solicitar una ruta a pie, comparte con Geoapify tu ubicación elegida y las coordenadas de la parada. Las imágenes del mapa identifican el área que ves.'),shell,'home-note');
  const message=text('p','',shell,'home-note');message.setAttribute('role','status');
  let busy=false;
  button(shell,t('Share location and show walking route','Compartir ubicación y mostrar ruta a pie'),async()=>{
   if(busy||!validPoint(S.location)||!validPoint(S.stop))return;
   closeWalking();busy=true;const origin=S.location,stop=S.stop,controller=new AbortController();
   const resultShell=text('section',null,shell,'home-live-shell');const w=walking={controller,shell:resultShell,map:null};
   const timeout=setTimeout(()=>controller.abort(),15000);
   message.textContent=t('Loading walking route…','Cargando ruta a pie…');
   try{
    const r=await fetch('/api/walking-route',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({latitude:origin.latitude,longitude:origin.longitude,stop_id:String(stop.stop_id),consent:true})});
    const d=await r.json();
    if(!r.ok){
     if(r.status===400&&d.code==='walking_distance_out_of_range'){
      const error=Error('Walking distance out of range');error.code=d.code;throw error;
     }
     throw Error('Unavailable');
    }
    if(walking!==w||S.location!==origin||S.stop!==stop)return;
    if(d.source!=='Geoapify'||d.mode!=='walking'||d.stop_id!==String(stop.stop_id)||!finite(d.distance_meters)||d.distance_meters<=0||!finite(d.duration_seconds)||d.duration_seconds<=0||age(d.retrieved_at,Date.now()/1000)>300||!Array.isArray(d.points)||d.points.length<2||!d.points.every(p=>Array.isArray(p)&&validPoint({latitude:p[0],longitude:p[1]})))throw Error('Invalid route');
    message.textContent='';
    const note=$('homeWalkingDuration');
    if(note)note.textContent=t('Estimated walk: ','Caminata estimada: ')+AyoUnits.distance(d.distance_meters)+' · '+Math.ceil(d.duration_seconds/60)+' min';
    text('p',AyoUnits.distance(d.distance_meters)+' · '+Math.ceil(d.duration_seconds/60)+' min',resultShell);
    text('p',t('Estimated walking route. Sidewalk condition, crossings and accessibility are not verified.','Ruta a pie estimada. No se verifican aceras, cruces ni accesibilidad.'),resultShell,'home-note');
    text('p','Powered by Geoapify · © OpenStreetMap contributors',resultShell,'home-note');
    button(resultShell,t('Hide walking map','Ocultar mapa a pie'),()=>closeWalking(),'home-text-button');
    if(!root.L){text('p',t('Map unavailable. Use external directions.','Mapa no disponible. Usa indicaciones externas.'),resultShell);return;}
    const el=text('div',null,resultShell,'home-live-map');el.setAttribute('role','region');el.setAttribute('aria-label',t('Walking route map','Mapa de ruta a pie'));
    const proxyTiles=d.basemap==='geoapify';
    w.map=root.L.map(el,{scrollWheelZoom:false,minZoom:proxyTiles?11:0,maxZoom:19});
    w.map.attributionControl.setPosition('topright').setPrefix(false);
    const osmCredit='<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';
    const attribution=proxyTiles?'Powered by <a href="https://www.geoapify.com/">Geoapify</a> · '+osmCredit:osmCredit;
    const url=proxyTiles?'/api/walking-map-tile?z={z}&x={x}&y={y}':'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tiles=root.L.tileLayer(url,{maxZoom:19,attribution,updateWhenIdle:true,noWrap:true});
    const tileStatus=text('p','',resultShell,'home-note');tileStatus.setAttribute('role','status');
    let automaticRetry=true,retryTimer=null,tileFailed=false;
    const redraw=()=>{clearTimeout(retryTimer);tiles.redraw();};
    const retryTiles=button(resultShell,t('Retry street tiles','Volver a cargar el mapa de calles'),redraw,'home-text-button');
    retryTiles.hidden=true;
    tiles.on('loading',()=>{tileFailed=false;tileStatus.textContent='';retryTiles.hidden=true;});
    tiles.on('remove',()=>clearTimeout(retryTimer));
    tiles.on('load',()=>{
     if(!tileFailed||!automaticRetry)return;
     automaticRetry=false;
     retryTimer=setTimeout(redraw,500);
    });
    tiles.on('tileerror',()=>{
     tileFailed=true;
     tileStatus.textContent=t('Some street tiles could not load. Walking directions are still shown.','No se pudieron cargar algunas imágenes de calles. La ruta a pie sigue visible.');
     retryTiles.hidden=false;
    });
    if(d.basemap!==false)tiles.addTo(w.map);
    const line=root.L.polyline(d.points,{color:'#D4A843',weight:5}).addTo(w.map);
    root.L.circleMarker([origin.latitude,origin.longitude],{radius:7}).addTo(w.map).bindTooltip(text('span',t('Start','Origen')));
    root.L.circleMarker([stop.latitude,stop.longitude],{radius:7}).addTo(w.map).bindTooltip(text('span',stop.name));
    w.map.fitBounds(line.getBounds().extend([origin.latitude,origin.longitude]).extend([stop.latitude,stop.longitude]),{padding:[28,28],maxZoom:17});
   }catch(error){
    if(walking===w){
     closeWalking();
     message.textContent=error.code==='walking_distance_out_of_range'
      ?t('The starting point must be between 16 ft and 3.1 mi from this stop. You can still use Apple Maps or Google Maps above.','El punto de partida debe estar entre 16 ft y 3.1 mi de esta parada. También puedes usar Apple Maps o Google Maps arriba.')
      :t('Walking route unavailable. Use Apple Maps or Google Maps above.','Ruta a pie no disponible. Usa Apple Maps o Google Maps arriba.');
    }
   }
   finally{clearTimeout(timeout);busy=false;}
  });
 }
 function show(screen,{focus=true}={}){
  S.screen=screen;for(const el of document.querySelectorAll('[data-home-screen]'))el.hidden=el.dataset.homeScreen!==screen;
  if(screen!=='selected'){closeMap();closeWalking();}status();
  if(focus){const heading=document.querySelector(`[data-home-screen="${screen}"] h1`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}window.scrollTo({top:screen==='nearby'?S.listY:0,behavior:'instant'});}
 }
 function locationIndicator(){ $('homeLocationIndicator').textContent=S.location?.kind==='gps'?t('Location enabled','Ubicación activada'):t('Location selected','Ubicación seleccionada');}
 async function chooseLocation(point,kind,name){
  S.locationIntent++;S.openIntent++;cancelSearch();clearTimeout(radiusDelay);
  if(!validPoint(point))throw Error(t('Location coordinates are unavailable. Choose another result.','Las coordenadas no están disponibles. Elige otro resultado.'));
  S.location={latitude:point.latitude,longitude:point.longitude,kind,selected_at:Math.floor(Date.now()/1000),timezone:point.timezone||null,name:name||t('Your selected location','Tu ubicación elegida')};S.stop=null;S.listY=0;S.stopVersion++;saveMode(kind);root.state.selectedLocation=S.location;
  root.dispatchEvent(new CustomEvent('ayo:location-selected',{detail:{...S.location}}));locationIndicator();show('nearby');await loadStops();
 }
 async function locate(){
  const intent=++S.locationIntent;cancelSearch();
  $('homeLocate').disabled=true;status(t('Finding nearby stops…','Buscando paradas cercanas…'));
  try{const pos=await AyoLocation.request({es:es(),options:{maximumAge:0}});if(intent!==S.locationIntent)return;await chooseLocation({latitude:pos.coords.latitude,longitude:pos.coords.longitude},'gps',t('Current GPS location','Ubicación GPS actual'));}
  catch(error){if(intent!==S.locationIntent)return;show('welcome',{focus:false});$('homeLocationForm').hidden=false;status(error.message);}
  finally{$('homeLocate').disabled=false;}
 }
 $('homeLocate').onclick=locate;
 $('homeManual').onclick=()=>{ S.locationIntent++; $('homeLocationForm').hidden=false;$('homeLocationQuery').focus({preventScroll:true});status();};
 let searchDelay=null,searchController=null;
 function cancelSearch(){clearTimeout(searchDelay);searchController?.abort();S.searchVersion++;}
 async function searchLocations(includePlaces=false){
  searchController?.abort();const controller=searchController=new AbortController(),serial=++S.searchVersion,q=$('homeLocationQuery').value.trim(),host=$('homeLocationMatches');host.replaceChildren();
  if(q.length<2&&!/^\d+$/.test(q)){if(includePlaces)status(t('Enter at least two characters.','Escribe al menos dos caracteres.'));return;}
  status(t('Searching real locations…','Buscando ubicaciones reales…'));
  try{
   const official=async()=>/^\d+$/.test(q)?{locations:(await api('/api/explore/stops?q='+encodeURIComponent(q),{signal:controller.signal})).stops}:await AyoLocationSearch.searchStops(q,{signal:controller.signal});
   const results=await Promise.allSettled([official(),...(includePlaces&&AyoLocationSearch.placesAvailable?[AyoLocationSearch.searchPlaces(q,{consent:true,signal:controller.signal}).then(locations=>({locations}))]:[])]);
   if(serial!==S.searchVersion||S.screen!=='welcome')return;
   const rows=[...new Map(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.locations||[]).filter(validPoint).map(row=>[`${row.stop_id||''}|${row.latitude}|${row.longitude}`,row])).values()];
   if(!rows.length){const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;status(AyoLocationSearch.placesAvailable?t('No matching location found. Try another address or official stop.','No se encontró una ubicación. Prueba otra dirección o parada oficial.'):t('No matching location found. Try an official stop, street or intersection. Full address search is not configured.','No se encontró una ubicación. Prueba una parada oficial, calle o intersección. No se ha configurado la búsqueda completa de direcciones.'));return;}
   for(const row of rows.slice(0,12)){const choice=button(host,row.name,()=>chooseLocation(row,'manual',row.name));text('small',row.kind==='place'?t('Address / place · Geoapify','Dirección / lugar · Geoapify'):t('Official MCTS stop / intersection','Parada / intersección oficial de MCTS'),choice);}if(includePlaces&&AyoLocationSearch.placesAvailable){const attribution=text('p',null,host,'home-note');const a=text('a','Powered by Geoapify',attribution);a.href='https://www.geoapify.com/';a.target='_blank';a.rel='noopener';text('span',' · © OpenStreetMap contributors',attribution);}
   status(results.some(r=>r.status==='rejected')?t('Some search sources are unavailable. Choose a verified result below.','Algunas fuentes no están disponibles. Elige un resultado verificado.'):t('Choose a result to establish your location.','Elige un resultado para establecer tu ubicación.'));
  }catch(error){if(serial===S.searchVersion&&!controller.signal.aborted)status(error.message);}
 }
 $('homeLocationQuery').addEventListener('input',()=>{cancelSearch();$('homeLocationMatches').replaceChildren();status();searchDelay=setTimeout(()=>searchLocations(false),300);});
 $('homeLocationForm').onsubmit=event=>{event.preventDefault();clearTimeout(searchDelay);searchLocations(true);};
 root.AyoLocationSearch.ready?.then(()=>{if(root.AyoLocationSearch.placesAvailable)$('homeSearchNote').textContent=t('Stop suggestions use MCTS data. When you submit Search locations, AYO sends the address or place you entered to Geoapify.','Las sugerencias de paradas usan datos de MCTS. Al pulsar Buscar ubicaciones, AYO envía a Geoapify la dirección o el lugar que escribiste.');});
 function radiusUI(smoke=false){
  const input=$('homeRadius'),w=input.getBoundingClientRect().width,ratio=(Number(input.value)-.1)/2.9;
  $('homeRadiusBus').style.setProperty('--thumb-x',(22+Math.max(0,w-44)*ratio)+'px');const value=Number(input.value).toFixed(1)+' '+t('miles','millas');$('homeRadiusValue').textContent=value;input.setAttribute('aria-valuetext',value);
  if(smoke){$('homeRadiusControl').classList.add('is-moving');clearTimeout(smokeDelay);smokeDelay=setTimeout(()=>$('homeRadiusControl').classList.remove('is-moving'),350);}
 }
 new ResizeObserver(()=>radiusUI()).observe($('homeRadius'));radiusUI();
 $('homeRadius').addEventListener('input',()=>{S.radius=Number($('homeRadius').value);root.dispatchEvent(new CustomEvent('ayo:radius-changed',{detail:{radius:S.radius}}));radiusUI(true);clearTimeout(radiusDelay);S.request?.abort();S.version++;$('homeStopsList').setAttribute('aria-busy','true');for(const b of $('homeStopsList').querySelectorAll('button'))b.disabled=true;status(t('Updating nearby stops…','Actualizando paradas cercanas…'));radiusDelay=setTimeout(()=>loadStops(),250);});
 $('homeChangeLocation').onclick=()=>{S.locationIntent++;cancelSearch();clearTimeout(radiusDelay);S.request?.abort();S.version++;$('homeLocationMatches').replaceChildren();show('welcome');};
 function isSaved(id){try{const f=JSON.parse(localStorage.getItem('ayo-workspace-favorites')||'{}'),old=JSON.parse(localStorage.getItem('ayo-stops')||'[]');return (Array.isArray(f.stops)&&f.stops.some(s=>s?.id===id))||(Array.isArray(old)&&old.includes(id));}catch{return false;}}
 function favorite(parent,stop){const b=button(parent,'',async()=>{await AyoWorkspaces.toggleStopFavorite(stop.stop_id);refreshStars();},'home-star');b.dataset.stopFavorite=stop.stop_id;return b;}
 function refreshStars(){for(const b of document.querySelectorAll('[data-stop-favorite]')){const on=isSaved(b.dataset.stopFavorite);b.textContent=on?'★':'☆';b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',t(on?'Remove saved stop':'Save stop',on?'Quitar parada guardada':'Guardar parada')+' '+b.dataset.stopFavorite);}}
 root.addEventListener('ayo:favorites-changed',refreshStars);
 const directions=stop=>[...new Set((stop.scheduled_directions||[]).map(d=>d.headsign).filter(Boolean))].join(' · ');
 function distance(stop){if(finite(stop.distance_meters)&&stop.distance_meters<=5)return t('At this stop','En esta parada');return finite(stop.distance_meters)?'≈ '+AyoUnits.distance(stop.distance_meters)+' · '+t('straight-line','en línea recta'):t('Select a location for distance','Elige una ubicación para ver la distancia');}
 async function loadStops(more=false){
  if(!S.location)return;S.request?.abort();const controller=S.request=new AbortController(),serial=++S.version;
  $('homeMoreStops').disabled=true;status(t('Searching nearby stops…','Buscando paradas cercanas…'));
  try{const params=new URLSearchParams({lat:S.location.latitude,lon:S.location.longitude,radius:S.radius.toFixed(1),offset:more?S.next||0:0});const data=await api('/api/explore/stops?'+params,{signal:controller.signal});if(serial!==S.version)return;
   if(!Array.isArray(data.stops))throw Error(t('Stop data is unavailable. Please retry.','Los datos de paradas no están disponibles. Vuelve a intentar.'));S.stopsError=false;S.rows=more?[...S.rows,...data.stops]:data.stops;S.rows=[...new Map(S.rows.map(s=>[s.stop_id,s])).values()].sort((a,b)=>a.distance_meters-b.distance_meters||String(a.stop_id).localeCompare(String(b.stop_id)));S.next=data.next_offset;S.total=data.total;if(!more)S.shown=5;
   $('homeStopsUpdated').textContent=t('Stop data checked: ','Paradas consultadas: ')+time(data.retrieved_at||Date.now()/1000)+' · MCTS GTFS';renderStops();status();
  }catch(error){if(serial!==S.version||controller.signal.aborted)return;S.stopsError=true;S.rows=[];S.next=null;renderStops();status(error.message);}
  finally{if(serial===S.version){$('homeMoreStops').disabled=false;$('homeStopsList').setAttribute('aria-busy','false');}}
 }
 function renderStops(){
  S.previews.clear();const host=$('homeStopsList');host.replaceChildren();if(!S.rows.length){text('p',S.stopsError?t('Nearby stops could not be loaded. Check your connection and retry.','No se pudieron cargar las paradas. Comprueba tu conexión e inténtalo de nuevo.'):t('No bus stops found within this distance. Try increasing the search radius or changing location.','No se encontraron paradas dentro de esta distancia. Amplía el radio o cambia la ubicación.'),host,'home-empty');if(S.stopsError)button(host,t('Retry nearby stops','Reintentar paradas cercanas'),()=>loadStops());}
  for(const stop of S.rows.slice(0,S.shown)){
   const card=text('article',null,host,'home-stop-card');card.dataset.stopId=stop.stop_id;const h=text('h2',null,card);button(h,stop.name,()=>selectStop(stop),'home-stop-open');favorite(card,stop);const directionNames=[...new Set((stop.scheduled_directions||[]).map(d=>d.direction_name).filter(Boolean))];if(directionNames.length)text('p',directionNames.join(' · '),card);text('p',distance(stop),card);
   const routes=text('div',null,card,'home-stop-routes');for(const route of [...new Set((stop.scheduled_directions||[]).map(d=>d.route_number||d.route_id).filter(Boolean))])text('span',route,routes,'home-route-pill');const preview=text('p',t('Arrival preview unavailable until checked.','Vista previa de llegadas pendiente de consulta.'),card,'home-note');preview.dataset.stopPreview=stop.stop_id;
  }
  refreshStars();$('homeMoreStops').hidden=S.shown>=S.rows.length&&S.next==null;S.previewAt=Date.now();previews(S.version);
 }
 async function previews(version){
  const rows=S.rows.slice(0,S.shown);let index=0;
  async function worker(){while(index<rows.length){const stop=rows[index++];try{const data=await api('/api/stops/'+encodeURIComponent(stop.stop_id)+'/departures');if(version!==S.version||S.screen!=='nearby')return;const preview=[...document.querySelectorAll('[data-stop-preview]')].find(n=>n.dataset.stopPreview===stop.stop_id);if(!preview)continue;data.departures=(Array.isArray(data.departures)?data.departures:[]).filter(d=>d.stop_id==null||String(d.stop_id)===String(stop.stop_id));S.previews.set(stop.stop_id,data);renderPreview(preview,data);}catch{if(version!==S.version)return;}}}
  await Promise.all([worker(),worker()]);
 }
 function renderPreview(preview,data){const first=ordered(data).find(d=>d.presentation.kind!=='canceled');preview.textContent=first?`${first.route_number||first.route_id} · ${first.trip_headsign||t('Direction unavailable','Sentido no disponible')} · ${countdown(first,sourceStatus(data),undefined,es())} · ${label(first.presentation.kind)}`:t('No upcoming arrivals returned.','No se devolvieron llegadas próximas.');preview.title=t('Trip-update source: ','Origen de datos de viajes: ')+time(data.feed_timestamp);}
 $('homeMoreStops').onclick=async()=>{S.shown+=5;if(S.shown>S.rows.length&&S.next!=null){const shown=S.shown;await loadStops(true);S.shown=shown;}renderStops();};
 function label(kind){return {arrival:t('Live · predicted arrival','En vivo · llegada estimada'),departure:t('Live · predicted departure','En vivo · salida estimada'),scheduled:t('Scheduled','Programado'),canceled:t('Canceled','Cancelado'),unknown:t('Arrival unavailable','Llegada no disponible')}[kind]||t('Arrival unavailable','Llegada no disponible');}
 async function selectStop(stop){
  closeMap();closeWalking();S.openIntent++;S.listY=window.scrollY;S.arrivalController?.abort();S.pendingArrivals=false;S.stop=stop;S.stopVersion++;S.arrivalsAt=0;$('homeArrivals').replaceChildren();S.arrivals=null;S.arrivalError=false;root.state.selectedStopId=stop.stop_id;show('selected');renderSelected();await arrivals();
 }
 function renderSelected(){
  const host=$('homeSelectedStop');host.replaceChildren();text('h1',S.stop.name,host).id='homeStopTitle';favorite(host,S.stop);if(S.stop.direction_name)text('p',S.stop.direction_name,host);text('p',distance(S.stop),host);text('p',t('Select Walk to This Stop to check walking time.','Selecciona Caminar hasta esta parada para consultar la duración.'),host,'home-note').id='homeWalkingDuration';
  button(host,t('Walk to This Stop','Caminar hasta esta parada'),()=>{const links=$('homeWalkLinks');closeWalking();links.replaceChildren();const urls=walkingURLs(S.location,S.stop);if(!urls){text('p',t('Choose your starting location to open walking directions.','Elige tu ubicación de origen para abrir las indicaciones a pie.'),links);button(links,t('Choose location','Elegir ubicación'),()=>show('welcome'));}else{for(const [name,url]of [['Apple Maps',urls.apple],['Google Maps',urls.google]]){const a=text('a',name,links);a.href=url;a.target='_blank';a.rel='noopener noreferrer';}text('p',t('External walking directions use your selected start and this official stop. Distance, time and accessibility must be checked there.','Las indicaciones externas usan el origen elegido y esta parada oficial. Consulta allí la distancia, duración y accesibilidad.'),links);}links.hidden=false;if(urls)addWalkingRoute(links);});
  $('homeWalkLinks').hidden=true;$('homeWalkLinks').replaceChildren();$('homeLegacyTools').open=false;refreshStars();
 }
 $('homeBackStops').onclick=()=>{S.stopVersion++;show(S.location?'nearby':'welcome');};
 $('homeRefreshArrivals').onclick=()=>arrivals();
 $('homeLegacyTools').addEventListener('toggle',()=>{if($('homeLegacyTools').open&&S.stop)legacyLoad?.(S.stop.stop_id);});
 async function openStopId(id){const intent=++S.openIntent,stop=await api('/api/explore/stops/'+encodeURIComponent(id));if(intent!==S.openIntent)return;if(S.location){const lat1=S.location.latitude*Math.PI/180,lat2=stop.latitude*Math.PI/180,dlat=lat2-lat1,dlon=(stop.longitude-S.location.longitude)*Math.PI/180;stop.distance_meters=6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2)));}root.AyoSite?.navigate('stops');await selectStop(stop);}
 root.ayoLoadStop=async id=>{await openStopId(id);};
 async function arrivals(){
  if(!S.stop||S.pendingArrivals)return;const id=S.stop.stop_id,serial=S.stopVersion,controller=S.arrivalController=new AbortController();S.pendingArrivals=true;S.arrivalsAt=Date.now();$('homeRefreshArrivals').disabled=true;status(t('Loading arrivals…','Cargando llegadas…'));
  try{const data=await api('/api/stops/'+encodeURIComponent(id)+'/departures?limit=200',{signal:controller.signal});if(serial!==S.stopVersion)return;data.departures=(Array.isArray(data.departures)?data.departures:[]).filter(d=>d.stop_id==null||String(d.stop_id)===String(id));S.arrivals=data;S.arrivalError=false;S.arrivalsAt=Date.now();renderArrivals();status();}
  catch(error){if(serial!==S.stopVersion)return;S.arrivalError=true;renderArrivals();status(error.message);}
  finally{if(S.arrivalController===controller){S.pendingArrivals=false;$('homeRefreshArrivals').disabled=false;}}
 }
 function renderArrivals(){
  const host=$('homeArrivals'),open=new Set([...host.querySelectorAll('details[open][data-trip-key]')].map(n=>n.dataset.tripKey));const live=S.live;const liveShell=live?.shell;if(liveShell)liveShell.remove();host.replaceChildren();
  const data=S.arrivalError?{...S.arrivals,realtime_status:'unavailable'}:S.arrivals;const rows=ordered(data),now=Date.now()/1000;
  if(!rows.length)text('p',S.arrivalError?t('Arrivals are unavailable. Reconnect and retry.','Las llegadas no están disponibles. Conéctate y vuelve a intentar.'):t('No upcoming buses returned in the covered schedule window. Check the official MCTS planner.','No se devolvieron autobuses próximos en el período cubierto. Consulta el planificador oficial de MCTS.'),host,'home-empty');
  for(const [i,dep]of rows.entries()){
   const row=text('details',null,host,'home-arrival');row.dataset.tripKey=key(dep);row.open=open.has(key(dep));const summary=text('summary',null,row);text('span',dep.route_number||dep.route_id,summary,'home-route-pill');const destination=text('span',dep.trip_headsign||t('Destination unavailable','Destino no disponible'),summary,'home-arrival-destination');text('small',dep.direction||dep.direction_name||t('Direction not supplied','Sentido no indicado'),destination);
   const when=text('span',null,summary,'home-arrival-when');const count=text('span',countdown(dep,sourceStatus(data,now),now,es()),when,'home-countdown');count.dataset.countdown=key(dep);const source=text('span',label(dep.presentation.kind),when,'home-data-label');source.dataset.dataLabel=key(dep);
   const body=text('div',null,row,'home-arrival-body'),dl=text('dl',null,body);const info=(title,value,cls)=>{text('dt',title,dl);const dd=text('dd',value,dl);if(cls)dd.dataset[cls]=key(dep);};
   info(t('FROM','DESDE'),S.stop.name);info(t('TO','HASTA'),dep.trip_headsign||t('Destination unavailable','Destino no disponible'));info(t('BUS','AUTOBÚS'),dep.route_number||dep.route_id);info(t('ARRIVING IN','LLEGA EN'),countdown(dep,sourceStatus(data,now),now,es()),'countdown');
   const next=rows.slice(i+1).find(d=>d.route_id===dep.route_id&&d.presentation.kind!=='canceled'&&finite(d.presentation.epoch)&&(dep.direction_id==null||d.direction_id==null||String(dep.direction_id)===String(d.direction_id)));
   info(t('NEXT SAME ROUTE','SIGUIENTE DE LA MISMA RUTA'),next?time(next.presentation.epoch)+' · '+label(next.presentation.kind):t('Not available','No disponible'));
   const technical=text('details',null,body,'home-data-details');text('summary',t('Data Details','Detalles de datos'),technical);text('p',t('Published schedule: ','Horario publicado: ')+time(dep.scheduled_epoch),technical,'home-note');text('p',t('Feed timestamp: ','Hora de la fuente: ')+time(data?.feed_timestamp),technical,'home-note');
   if(walkingWarning(S.stop.walking,dep,data,now))text('p',t('You may not reach this bus in time.','Es posible que no llegues a tiempo a este autobús.'),body,'home-warning');
   const sourceLine=text('p',null,technical,'home-note');sourceLine.dataset.predictionSource=key(dep);sourceLine.textContent=t('Prediction reported: ','Predicción informada: ')+time(dep.prediction_reported_at);
   const official=text('details',null,body);AyoAlertStore.bind(official,dep.route_id,document.documentElement.lang);
   const showButton=button(body,t('Show Live Bus Location','Ver ubicación del autobús'),()=>showMap(dep,body),'home-secondary');showButton.dataset.mapFor=key(dep);
   if(live?.key===key(dep)){body.append(liveShell);showButton.hidden=true;row.open=true;requestAnimationFrame(()=>live.map?.invalidateSize({pan:false}));}
   row.addEventListener('toggle',()=>{if(!row.open&&S.live?.key===key(dep))closeMap();});
  }
  if(live&&!rows.some(d=>key(d)===live.key))closeMap();
  if(data?.truncated)text('p',t('Additional services exist beyond this response limit. Check the official MCTS planner.','Existen servicios adicionales fuera del límite de respuesta. Consulta el planificador oficial de MCTS.'),host,'home-note');
  updateFreshness();
 }
 function updateFreshness(){
  const data=S.arrivals,now=Date.now()/1000;let value=t('Arrivals unavailable.','Llegadas no disponibles.');
  if(data){value=t('Checked: ','Consultado: ')+time(data.retrieved_at||S.arrivalsAt/1000);if(S.arrivalError||!navigator.onLine||sourceStatus(data,now)!=='fresh')value+=' · '+t('Live data is stale or unavailable. Verified scheduled times are labeled Scheduled.','Los datos en vivo son antiguos o no están disponibles. Los horarios verificados se indican como Programado.');}
  $('homeArrivalFreshness').textContent=value;
 }
 function closeMap(){
  const live=S.live;if(!live)return;S.live=null;live.controller?.abort();live.map?.remove();live.shell.remove();for(const b of document.querySelectorAll('[data-map-for]'))if(b.dataset.mapFor===live.key)b.hidden=false;
 }
 async function showMap(dep,parent){
  closeMap();const shell=text('section',null,parent,'home-live-shell'),message=text('p',t('Loading vehicle positions…','Cargando posiciones de vehículos…'),shell,'home-note');message.setAttribute('role','status');
  const live=S.live={key:key(dep),dep,shell,message,map:null,marker:null,shape:null,pending:false,attempted:0,controller:new AbortController()};
  button(shell,t('Hide Live Bus Location','Ocultar ubicación del autobús'),closeMap,'home-text-button');for(const b of document.querySelectorAll('[data-map-for]'))if(b.dataset.mapFor===live.key)b.hidden=true;
  await refreshMap(live);
 }
 async function refreshMap(live){
  if(live!==S.live||live.pending)return;live.pending=true;live.attempted=Date.now();live.message.textContent=t('Loading vehicle positions…','Cargando posiciones de vehículos…');
  try{const data=await api('/api/trips/'+encodeURIComponent(live.dep.trip_id)+'/vehicle?'+new URLSearchParams({service_date:live.dep.service_date,stop_id:S.stop.stop_id,stop_sequence:live.dep.stop_sequence}),{signal:live.controller.signal});if(live!==S.live)return;const bus=vehicleFor(live.dep,data);
   if(!bus){if(live.marker){live.marker.remove();live.marker=null;}live.shape?.remove();live.shape=null;
    live.message.textContent=vehicleUnavailableMessage(data.reason,t);return;}
   if(!root.L){live.message.textContent=t('The map could not load. Arrival information remains available.','No se pudo cargar el mapa. Las llegadas siguen disponibles.');return;}
   if(!live.map){const element=text('div',null,live.shell,'home-live-map');element.setAttribute('role','region');element.setAttribute('aria-label',t('Selected bus and stop map','Mapa del autobús y la parada elegidos'));live.shell.insertBefore(element,live.shell.lastElementChild);const relayTiles=document.body.dataset.relayStreetTiles==='true';live.map=L.map(element,{scrollWheelZoom:false,minZoom:relayTiles?11:0});const tileStatus=text('p','',live.shell,'home-note');tileStatus.hidden=true;L.tileLayer(relayTiles?'/api/walking-map-tile?z={z}&x={x}&y={y}':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,updateWhenIdle:true,noWrap:relayTiles,attribution:(relayTiles?'Powered by <a href="https://www.geoapify.com/">Geoapify</a> · ':'')+'<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'}).on('loading',()=>{tileStatus.hidden=true;}).on('tileerror',()=>{tileStatus.hidden=false;tileStatus.textContent=t('Street map tiles could not load. Check your connection. Markers show reported positions, not walking directions.','No se pudo cargar el mapa de calles. Comprueba tu conexión. Los marcadores muestran posiciones informadas, no indicaciones a pie.');}).addTo(live.map);L.circleMarker([S.stop.latitude,S.stop.longitude],{radius:8,color:'#82bb9c',fillColor:'#82bb9c',fillOpacity:1,weight:2}).addTo(live.map).bindTooltip(text('span',S.stop.name));live.map.fitBounds([[S.stop.latitude,S.stop.longitude],[bus.latitude,bus.longitude]],{padding:[28,28],maxZoom:16});
    api('/api/trips/'+encodeURIComponent(live.dep.trip_id)+'/shape',{signal:live.controller.signal}).then(shape=>{if(live!==S.live||shape.trip_id!==live.dep.trip_id||shape.route_id!==live.dep.route_id||!live.marker)return;const points=shape.points;if(Array.isArray(points)&&points.length>1&&points.every(p=>Array.isArray(p)&&validPoint({latitude:p[0],longitude:p[1]}))){live.shape=L.polyline(points,{color:'#f0c169',weight:3,opacity:.6,interactive:false}).addTo(live.map);text('p',t('Full scheduled trip shape · not a walking route','Trazado completo del viaje programado · no es una ruta a pie'),live.shell,'home-note');}}).catch(()=>{});
   }
   if(live.marker)live.marker.setLatLng([bus.latitude,bus.longitude]);else live.marker=L.marker([bus.latitude,bus.longitude],{icon:L.divIcon({className:'home-bus-marker',html:'<svg class="icon" aria-hidden="true"><use href="/static/img/icons.svg#stop"/></svg>',iconSize:[36,36],iconAnchor:[18,18]}),title:t('Reported bus location','Ubicación informada del autobús')}).addTo(live.map);
   live.reportedAt=bus.reported_at;live.message.textContent=t('Verified reported bus position.','Posición informada del autobús verificada.');const technical=live.shell.closest('.home-arrival-body')?.querySelector('.home-data-details');if(technical){let gps=technical.querySelector('[data-vehicle-time]');if(!gps){gps=text('p',null,technical,'home-note');gps.dataset.vehicleTime='true';}gps.textContent=t('Vehicle GPS (not an arrival prediction): ','GPS del vehículo (no es una predicción de llegada): ')+time(bus.reported_at);}
  }catch(error){if(live!==S.live||live.controller.signal.aborted)return;live.marker?.remove();live.marker=null;live.shape?.remove();live.shape=null;live.message.textContent=error.message;}
  finally{live.pending=false;}
 }
 function tick(){
  if(document.hidden||root.AyoSite?.activeView!=='stops')return;const now=Date.now()/1000;
  if(S.screen==='selected'){
   const data=S.arrivalError||!navigator.onLine?{...S.arrivals,realtime_status:'unavailable'}:S.arrivals;
   const expected=ordered(data,now).map(key).join(','),visible=[...$('homeArrivals').querySelectorAll('.home-arrival')].map(el=>el.dataset.tripKey).join(',');if(expected!==visible)renderArrivals();
   const byKey=new Map((Array.isArray(data?.departures)?data.departures:[]).map(d=>[key(d),d]));for(const el of document.querySelectorAll('[data-countdown]')){const dep=byKey.get(el.dataset.countdown);if(dep)el.textContent=countdown(dep,sourceStatus(data,now),now,es());}for(const el of document.querySelectorAll('[data-data-label]')){const dep=byKey.get(el.dataset.dataLabel);if(dep)el.textContent=label(transit.departureState(dep,sourceStatus(data,now),now).kind);}
   updateFreshness();if(navigator.onLine&&Date.now()-S.arrivalsAt>=30000&&!S.pendingArrivals)arrivals();
   const live=S.live;if(live){if(age(live.reportedAt,now)>120&&live.marker){live.marker.remove();live.marker=null;live.shape?.remove();live.shape=null;live.message.textContent=t('Vehicle position is stale. Await a fresh verified report.','La posición es antigua. Espera un informe actualizado y verificado.');}if(navigator.onLine&&Date.now()-live.attempted>=15000)refreshMap(live);}
  }else if(S.screen==='nearby'){for(const el of document.querySelectorAll('[data-stop-preview]')){const data=S.previews.get(el.dataset.stopPreview);if(data)renderPreview(el,!navigator.onLine?{...data,realtime_status:'unavailable'}:data);}if(navigator.onLine&&Date.now()-S.previewAt>=60000){S.previewAt=Date.now();previews(S.version);}}
 }
 function startTimer(){if(!S.timer)S.timer=setInterval(tick,1000);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});root.addEventListener('offline',()=>{S.arrivalError=true;S.live?.controller.abort();closeMap();closeWalking();tick();status(t('Offline. Reconnect to refresh transit information.','Sin conexión. Conéctate para actualizar el transporte.'));});root.addEventListener('online',()=>{if(S.screen==='selected')arrivals();else if(S.screen==='nearby'&&S.location)loadStops();});
 root.addEventListener('pagehide',()=>{clearInterval(S.timer);S.timer=null;S.request?.abort();closeMap();closeWalking();});root.addEventListener('pageshow',()=>{startTimer();tick();});
 function navigation(){const active=root.AyoSite?.activeView==='stops';document.body.classList.toggle('home-active',active);if(!active){S.locationIntent++;S.openIntent++;closeMap();closeWalking();}else{radiusUI();tick();}}
 root.addEventListener('ayo:screen-change',navigation);navigation();startTimer();
 root.AyoHome={get map(){return S.live?.map||null;},get location(){return S.location;},get screen(){return S.screen;},get radius(){return S.radius;},get selectedStop(){return S.stop;},openStop:openStopId,chooseLocation,refresh:arrivals,goHome(){S.stopVersion++;S.listY=0;show(S.location?'nearby':'welcome');}};
 // Permission state, not a saved preference, determines whether GPS can be
 // restored without prompting. Never persist precise coordinates.
 (async()=>{
  if(!navigator.permissions?.query)return;
  const welcome=$('homeWelcome'),intent=S.locationIntent;welcome.style.visibility='hidden';
  let timeout;
  try{
   const permission=await Promise.race([navigator.permissions.query({name:'geolocation'}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Permission check timed out')),1500);})]);
   if(intent!==S.locationIntent)return;
   if(permission.state==='granted'&&root.AyoSite?.activeView==='stops'){status(t('Finding nearby stops…','Buscando paradas cercanas…'));await locate();}
   else if(permission.state==='denied'&&mode()==='gps')status(t('Location permission was revoked. Enable it in browser settings or enter a location manually.','Se revocó el permiso. Actívalo en el navegador o introduce una ubicación manualmente.'));
   else status();
  }catch{if(intent===S.locationIntent)status();/* No reliable permission state: no GPS call. */}
  finally{clearTimeout(timeout);welcome.style.visibility='';welcome.hidden=S.screen!=='welcome';}
 })();
});
})(typeof window!=='undefined'?window:globalThis);
