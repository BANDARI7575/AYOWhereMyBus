/* Home-only decoration and shortcut; no new assistant or timer loop. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const bus=document.getElementById('dividerBus'),button=document.getElementById('voiceShortcut');
 const settings=window.AyoHomeSettings={animationEnabled:true,intervalSeconds:10,...window.AyoHomeSettings};
 let visible=false;const notice=document.querySelector('.ayo-arrival-notice');if(notice){new MutationObserver(update).observe(notice,{attributes:true,attributeFilter:['hidden']});new ResizeObserver(update).observe(notice);}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});observer.observe(document.getElementById('navbar'));
 function update(){const home=window.AyoSite?.activeView==='stops',keyboard=!!window.visualViewport&&innerHeight-visualViewport.height>150;button.hidden=!home||keyboard||!!document.querySelector('dialog[open]');bus.hidden=!home||!settings.animationEnabled;button.style.setProperty('--voice-notice-lift',notice&&!notice.hidden?Math.ceil(notice.getBoundingClientRect().height)+12+'px':'0px');bus.style.setProperty('--bus-interval',Math.max(5,Number(settings.intervalSeconds)||10)+'s');bus.classList.toggle('moving',home&&visible&&!document.hidden&&settings.animationEnabled);}
 window.addEventListener('ayo:screen-change',update);document.addEventListener('visibilitychange',update);window.visualViewport?.addEventListener('resize',update);new MutationObserver(update).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 button.addEventListener('click',()=>window.AyoWorkspaces.open('voice'));update();
});
