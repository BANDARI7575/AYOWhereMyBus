/* Five passenger destinations; history and screen positions stay browser-local. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),es=()=>document.documentElement.lang==='es',t=(a,b)=>es()?b:a;
 const views=['stops','map','trip','alerts','saved','about','founder'];
 const aliases={home:'stops',main:'map',journey:'trip',features:'saved',riderTools:'stops','winter-watch':'stops',creator:'founder'};
 const positions={};let active='stops',restoring=false,navigationVersion=0;
 // This router owns same-document positions; native restoration must not race it.
 if('scrollRestoration' in history)history.scrollRestoration='manual';
 const initialEntry=history.state;
 const returning=performance.getEntriesByType('navigation')[0]?.type==='back_forward';
 function remember(){try{positions[active]=scrollY;history.replaceState({...history.state,view:active,y:scrollY,positions:{...positions}},'');}catch{}}
 window.addEventListener('pagehide',remember);
 const resolve=()=>{const hash=location.hash.slice(1);return aliases[hash]|| (views.includes(hash)?hash:'stops');};
 const closeMenu=()=>{byId('navLinks').hidden=true;byId('mobileMenuButton').setAttribute('aria-expanded','false');};
 async function show(view,{preserve=false}={}){
  const serial=++navigationVersion;const old=active;positions[old]=scrollY;active=view;closeMenu();
  for(const section of document.querySelectorAll('[data-screen]'))section.hidden=section.dataset.screen!==view;
  byId('about').hidden=view!=='about';
  for(const link of document.querySelectorAll('.app-nav a')){if(link.dataset.view===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  const alerts=byId('serviceAlerts');if(alerts){(view==='alerts'?byId('alertsHost'):byId('homeAlertsHost')).append(alerts);if(view==='alerts')alerts.open=true;}
  if(view==='saved')await window.AyoWorkspaces?.renderSaved(byId('savedContent'));
  if(serial!==navigationVersion)return;
  if(view==='map')requestAnimationFrame(()=>resizeTransitMap());
  if(!preserve&&!restoring)window.scrollTo({top:positions[view]||0,behavior:'instant'});
  window.dispatchEvent(new CustomEvent('ayo:feature-opened',{detail:{feature:['trip','map'].includes(view)?'planner':'home'}}));
  window.dispatchEvent(new CustomEvent('ayo:screen-change',{detail:{view,previous:old}}));
 }
 function navigate(view){if(!views.includes(view))return;remember();if(location.hash!=='#'+view)history.pushState({view,y:positions[view]||0,positions:{...positions}},'','#'+view);show(view).then(()=>{if(active===view)remember();});}
 window.AyoSite={navigate,get activeView(){return active;}};
 window.addEventListener('hashchange',()=>{const view=resolve();if(view!==active)show(view).then(remember);});
 window.addEventListener('popstate',event=>{const view=resolve();if(event.state?.positions)Object.assign(positions,event.state.positions);show(view,{preserve:true}).then(()=>{if(active!==view)return;window.scrollTo({top:Number.isFinite(event.state?.y)?event.state.y:positions[view]||0,behavior:'instant'});remember();});});
 document.addEventListener('click',event=>{const a=event.target.closest('a[href^="#"]');if(!a)return;const key=a.getAttribute('href').slice(1),view=aliases[key]||key;if(a.classList.contains('skip-link')){event.preventDefault();byId('main').focus({preventScroll:true});return;}if(views.includes(view)){event.preventDefault();navigate(view);}});
 byId('mobileMenuButton').addEventListener('click',()=>{const open=byId('navLinks').hidden;byId('navLinks').hidden=!open;byId('mobileMenuButton').setAttribute('aria-expanded',String(open));});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!byId('navLinks').hidden){closeMenu();byId('mobileMenuButton').focus({preventScroll:true});}});
 document.addEventListener('click',event=>{if(!byId('navbar').contains(event.target))closeMenu();});
 document.querySelectorAll('[data-workspace]').forEach(button=>button.addEventListener('click',()=>{closeMenu();AyoWorkspaces.open(button.dataset.workspace);}));
 byId('nearbyButton').addEventListener('click',async()=>{await AyoWorkspaces.open('nearby');const dialog=byId('featureWorkspace');const button=[...dialog.querySelectorAll('button')].find(b=>b.textContent===t('Find Stops Near Me','Buscar paradas cerca de mí'));if(button)button.click();else byId('riderStatus').textContent=t('Search by stop name or ID when location is unavailable.','Busca por nombre o ID si la ubicación no está disponible.');});
 byId('allRoutesButton').addEventListener('click',()=>{stopTracking();state.route='';state.mode='all';state.position=null;state.map?.setView([43.0389,-87.9065],12);byId('routeInput').value='';byId('mapRouteLabel').textContent=t('All routes','Todas las rutas');renderFavorites();window.dispatchEvent(new CustomEvent('ayo:route-selected',{detail:{route:''}}));cycle(false);});
 byId('filterRouteButton').addEventListener('click',()=>{navigate('stops');requestAnimationFrame(()=>byId('routeInput').focus({preventScroll:true}));});
 byId('resumeTracking').addEventListener('click',()=>{if(document.hidden||!navigator.onLine)return;stopTracking();byId('trackingState').textContent=t('Updating vehicle positions','Actualizando posiciones');cycle(false);});
 window.addEventListener('ayo:route-selected',()=>byId('mapRouteLabel').textContent=state.route?t('Route ','Ruta ')+state.route:t('All routes','Todas las rutas'));
 const theme=byId('themeButton');const updateTheme=()=>{theme.setAttribute('aria-pressed',String(document.body.classList.contains('day-mode')));document.querySelector('meta[name="theme-color"]').content=document.body.classList.contains('day-mode')?'#f2f4f7':'#0E1013';};theme.addEventListener('click',updateTheme);updateTheme();
 const network=()=>{const offline=!navigator.onLine;byId('networkStatus').hidden=!offline;byId('networkStatus').textContent=t('Offline — saved interface only. Live positions and new arrivals need a connection.','Sin conexión: solo la interfaz guardada. Las posiciones y llegadas nuevas requieren conexión.');if(offline)window.AyoRiderTools?.invalidate?.();else window.AyoRiderTools?.refresh?.().catch(()=>{});};window.addEventListener('offline',network);window.addEventListener('online',network);network();
 window.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)window.AyoRiderTools?.refresh?.().catch(()=>{});});
 window.addEventListener('ayo:language-change',()=>{try{sessionStorage.setItem('ayo-view-state',JSON.stringify({view:active,y:scrollY,positions,selectedStop:window.AyoRiderTools?.selectedStopId}));}catch{}});
 let saved;try{saved=JSON.parse(sessionStorage.getItem('ayo-view-state')||'null');sessionStorage.removeItem('ayo-view-state');}catch{}
 if(saved&&views.includes(saved.view)){
  restoring=true;Object.assign(positions,saved.positions||{});active=saved.view;
  history.replaceState(history.state,'','#'+active);
  show(active,{preserve:true}).then(async()=>{await document.fonts.ready;if(typeof saved.selectedStop==='string'&&saved.selectedStop!==window.AyoRiderTools?.selectedStopId)await window.ayoLoadStop(saved.selectedStop);requestAnimationFrame(()=>{window.scrollTo({top:Number.isFinite(saved.y)?saved.y:0,behavior:'instant'});restoring=false;});});
 }else if(returning&&Number.isFinite(initialEntry?.y)){Object.assign(positions,initialEntry.positions||{});show(resolve(),{preserve:true}).then(async()=>{await document.fonts.ready;window.scrollTo({top:initialEntry.y,behavior:'instant'});remember();});}
 else show(resolve(),{preserve:false});
 // Render only routes present in the actual timetable, never invented identifiers.
 fetch('/api/explore/routes',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Route catalog unavailable');return r.json();}).then(data=>{
  const container=byId('quickRoutes');for(const id of ['BLU','PUR','GRE','19','21']){const route=data.routes.find(r=>r.route_id===id);if(!route)continue;const b=document.createElement('button');b.type='button';b.className='route-chip';b.textContent=route.route_short_name||id;b.setAttribute('aria-label',t('Track route ','Seguir ruta ')+(route.route_short_name||id));b.addEventListener('click',()=>searchRoute(route.route_id));container.append(b);}
 }).catch(()=>{});
});
