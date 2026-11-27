const CACHE='ayo-shell-v35';
const SHELL=["/static/img/founder-leaning.png","/static/css/founder.css","/static/img/founder-character.png","/static/css/saved.css","/static/js/saved.js","/static/css/alerts.css","/static/js/alerts-appearance.js","/static/js/community-reports.js","/static/css/trip.css","/ai","/static/css/ai.css","/static/js/assistant.js","/static/js/ai-chat.js","/static/css/home.css","/static/js/home-stops.js","/static/js/location-access.js","/static/js/alert-store.js","/static/js/home-experience.js","/static/js/navigation.js","/static/js/transit-ui.js","/static/js/location-search.js","/static/img/icons.svg","/static/js/units.js","/static/js/workspaces.js","/static/manifest.webmanifest","/static/manifest-es.webmanifest","/","/static/css/style.css","/static/js/i18n.js","/static/es.json","/static/js/pwa.js","/static/js/app.js","/static/js/weather.js","/static/js/rider-tools.js","/static/js/journey.js","/static/privacy.html","/static/img/icon-192.png","/static/img/icon-512.png","/static/vendor/leaflet/leaflet.js","/static/vendor/leaflet/leaflet.css","/static/vendor/fonts/dm-sans-latin-wght-italic.woff2","/static/vendor/fonts/dm-sans-latin-wght-normal.woff2","/static/vendor/fonts/fonts.css","/static/vendor/leaflet/images/layers.png","/static/vendor/leaflet/images/marker-icon.png","/static/vendor/leaflet/images/marker-icon-2x.png","/static/vendor/leaflet/images/marker-shadow.png","/static/vendor/leaflet/images/layers-2x.png"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ayo-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
 const network=fetch(e.request);
 // Keep the offline shell in sync with files successfully served online.
 // Otherwise a later network failure can restore JavaScript from installation day.
 if(SHELL.includes(u.pathname)&&!u.search){
  e.waitUntil(network.then(response=>{
   if(response.ok){
    const copy=response.clone();
    return caches.open(CACHE).then(cache=>cache.put(e.request,copy));
   }
  }).catch(()=>{}));
 }
 e.respondWith(network.catch(()=>caches.match(e.request).then(r=>r||new Response('Offline. Transit data requires a connection. / Sin conexión. Los datos requieren conexión.',{status:503}))));
});
self.addEventListener('push',e=>{
 let data={};try{data=e.data.json();}catch{}
 const spanish=data.language==='es';const fresh=Number.isFinite(data.expires_at)&&Date.now()/1000<data.expires_at&&data.prediction_at>Date.now()/1000;
 const body=fresh&&typeof data.body==='string'?data.body.slice(0,250):spanish?'El aviso ha caducado. Abre AYO para consultar datos actuales.':'This alert expired. Open AYO for current transit data.';
 e.waitUntil(self.registration.showNotification('AYO!',{body,tag:typeof data.tag==='string'?data.tag:'ayo-arrival',renotify:false,icon:'/static/img/icon-192.png',data:{url:'/#riderTools'}}));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const client=list.find(c=>new URL(c.url).origin===self.location.origin);if(client){client.navigate('/#riderTools');return client.focus();}return clients.openWindow('/#riderTools');}));});
