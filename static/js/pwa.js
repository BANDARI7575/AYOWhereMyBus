/* Installation and foreground-safe PWA update controls; no claim of device certification. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const es=()=>document.documentElement.lang==='es';const t=(a,b)=>es()?b:a;
 const host=document.getElementById('installationTools');if(!host)return;
 const section=document.createElement('section');section.className='installation-tools';host.append(section);
 const button=document.createElement('button');button.type='button';button.className='favorite-chip';button.textContent=t('Installation help','Ayuda de instalación');section.append(button);
 const message=document.createElement('p');message.setAttribute('role','status');section.append(message);
 let installEvent=null;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;button.textContent=t('Install AYO','Instalar AYO');});
 window.addEventListener('appinstalled',()=>{installEvent=null;button.textContent=t('Installed','Instalado');button.disabled=true;message.textContent=t('AYO is installed on this device.','AYO está instalado en este dispositivo.');});
 button.onclick=async()=>{
  if(window.matchMedia('(display-mode: standalone)').matches){message.textContent=t('AYO is already open as an installed app.','AYO ya está abierto como aplicación instalada.');return;}
  if(installEvent){const event=installEvent;installEvent=null;await event.prompt();const choice=await event.userChoice;message.textContent=choice.outcome==='accepted'?t('Installation requested. Confirm it in your browser.','Instalación solicitada. Confírmala en el navegador.'):t('Installation dismissed. You can keep using the website.','Instalación cancelada. Puedes seguir usando la web.');}
  else message.textContent=t('Use your browser menu to install AYO. On iPhone or iPad: Share → Add to Home Screen. Installation availability depends on your browser.','Usa el menú del navegador para instalar AYO. En iPhone o iPad: Compartir → Añadir a pantalla de inicio. La disponibilidad depende del navegador.');
 };
 if('serviceWorker'in navigator)navigator.serviceWorker.getRegistration('/').then(reg=>{
  if(!reg)return;
  function update(){if(!reg.waiting)return;const b=document.createElement('button');b.type='button';b.className='favorite-chip';b.textContent=t('Update AYO and reload','Actualizar AYO y recargar');b.onclick=()=>{navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});reg.waiting.postMessage({type:'ACTIVATE'});};section.append(b);}
  // Installation may already be in progress before this module attaches.
  update();reg.installing?.addEventListener('statechange',update);reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',update));
 }).catch(()=>{});
});
