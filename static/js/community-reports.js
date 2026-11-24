/* Pending community observations only. Never requests GPS or sends notifications. */
(function(root){
'use strict';
function payload(stop,category,comment,snapshot,categories){
 if(!snapshot?.available||!snapshot.stops.some(row=>String(row.stop_id)===stop))throw Error('stop');
 if(!categories.some(row=>row.id===category))throw Error('category');
 if(typeof comment!=='string'||comment.length>500)throw Error('comment');
 comment=comment.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(comment.length>500)throw Error('comment');
 return {stop_id:stop,category,comment};
}
if(typeof module!=='undefined'&&module.exports){module.exports={payload};return;}
document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),form=$('communityReportForm');if(!form)return;
 const stop=$('communityStop'),category=$('communityCategory'),comment=$('communityComment'),submit=$('submitCommunityReport'),status=$('communitySubmissionStatus');
 const es=()=>document.documentElement.lang==='es',t=(en,spanish)=>es()?spanish:en;
 let snapshot=root.AyoNearbySummary?.snapshot,categories=[],busy=false,scope=null,optionsKey=null,lastSubmitted=null,categoryLoading=false,categoryError=false,feedback=false;
 function option(host,value,label,source=false){const node=document.createElement('option');node.value=value;node.textContent=label;if(source)node.dataset.noTranslate='true';host.append(node);}
 function update(next=snapshot){
  snapshot=next;const rows=snapshot?.stops||[],key=JSON.stringify([snapshot?.key,rows.map(row=>[row.stop_id,row.name])]);
  if(key!==optionsKey){const previous=scope===snapshot?.key?stop.value:'';stop.replaceChildren();option(stop,'',t('Choose a nearby stop','Elige una parada cercana'));for(const row of rows)option(stop,String(row.stop_id),row.name+' · '+row.stop_id,true);stop.value=previous;optionsKey=key;}
  if(scope&&scope!==snapshot?.key){feedback=false;status.textContent='';}
  scope=snapshot?.key;const available=!!snapshot?.available&&rows.length>0;
  stop.disabled=busy||!available;category.disabled=busy||!categories.length;comment.disabled=busy;
  submit.disabled=busy||!available||!categories.length||!navigator.onLine;
  if(!busy&&!feedback&&categoryError)status.textContent=t('Report categories are unavailable. Reopen this section or reconnect to retry.','Las categorías no están disponibles. Vuelve a abrir esta sección o reconéctate para reintentar.');
  else if(!busy&&!feedback&&!snapshot?.key)status.textContent=t('Choose a location on Home first. No new location permission is requested here.','Elige primero una ubicación en Inicio. Aquí no se solicita otro permiso de ubicación.');
  else if(!busy&&!feedback&&!available)status.textContent=t('Nearby stops are unavailable or stale. Refresh the nearby summary before submitting.','Las paradas cercanas no están disponibles o están desactualizadas. Actualiza el resumen antes de enviar.');
  else if(!busy&&!feedback)status.textContent='';
 }
 async function loadCategories(){
  if(categoryLoading||categories.length)return;categoryLoading=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/api/community/config',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Unavailable');const data=await response.json();
   if(!Array.isArray(data.categories)||!data.categories.length||data.comment_max_length!==500||data.categories.some(row=>!row||!/^\w+$/.test(row.id)||typeof row.en!=='string'||typeof row.es!=='string')||new Set(data.categories.map(row=>row.id)).size!==data.categories.length)throw Error('Invalid categories');
   categoryError=false;categories=data.categories;category.replaceChildren();option(category,'',t('Choose a category','Elige una categoría'));for(const row of categories)option(category,row.id,row[es()?'es':'en']);
  }catch{categoryError=true;category.replaceChildren();option(category,'',t('Categories unavailable','Categorías no disponibles'));status.textContent=t('Report categories are unavailable. Reopen this section or reconnect to retry.','Las categorías no están disponibles. Vuelve a abrir esta sección o reconéctate para reintentar.');}
  finally{clearTimeout(timeout);categoryLoading=false;update();}
 }
 form.noValidate=true;
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;feedback=true;
  let data;try{data=payload(stop.value,category.value,comment.value,snapshot,categories);}
  catch(error){status.textContent=error.message==='stop'?t('Choose a current nearby stop. Refresh Home or the nearby summary if needed.','Elige una parada cercana actualizada. Actualiza Inicio o el resumen si es necesario.'):error.message==='category'?t('Choose a report category.','Elige una categoría de informe.'):t('Use a comment of at most 500 characters.','Usa un comentario de hasta 500 caracteres.');(error.message==='stop'?stop:error.message==='category'?category:comment).focus();return;}
  const fingerprint=JSON.stringify(data);if(fingerprint===lastSubmitted){status.textContent=t('This observation was already submitted. Please do not repeat it.','Esta observación ya se envió. No la repitas.');return;}
  busy=true;update();status.textContent=t('Submitting for moderation…','Enviando a moderación…');form.setAttribute('aria-busy','true');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/api/winter/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',signal:controller.signal});
   if(response.status!==202){status.textContent=response.status===409?t('This observation was already submitted. Please do not repeat it.','Esta observación ya se envió. No la repitas.'):response.status===429?t('Submission limit reached. Wait before trying again.','Se alcanzó el límite de envíos. Espera antes de volver a intentar.'):response.status===400?t('Check the stop, category and comment. Use plain text without HTML, links or contact details.','Comprueba la parada, categoría y comentario. Usa texto sin HTML, enlaces ni datos de contacto.'):t('Reports are unavailable. Your submission was not confirmed; check your connection before retrying.','Los informes no están disponibles. No se confirmó el envío; comprueba la conexión antes de reintentar.');return;}
   const result=await response.json();if(result.state!=='pending'||!Number.isInteger(result.created)||result.expires!==result.created+86400)throw Error('Unconfirmed submission');
   lastSubmitted=fingerprint;comment.value='';category.value='';status.textContent=t('Submitted for moderation. It is not public until approved and expires 24 hours after posting.','Enviado a moderación. No será público hasta aprobarse y vence 24 horas después del envío.');
   root.dispatchEvent(new Event('ayo:community-submitted'));
  }catch{status.textContent=t('Submission could not be confirmed. Check your connection before retrying; repeated observations are rejected.','No se pudo confirmar el envío. Comprueba la conexión antes de reintentar; se rechazan las observaciones repetidas.');}
  finally{clearTimeout(timeout);busy=false;form.setAttribute('aria-busy','false');update();}
 };
 form.addEventListener('input',()=>{if(!busy){feedback=false;update();}});
 root.addEventListener('ayo:nearby-summary',event=>update(event.detail));
 root.addEventListener('online',()=>{loadCategories();update();});root.addEventListener('offline',()=>update());
 $('communitySubmission').addEventListener('toggle',()=>{if($('communitySubmission').open)loadCategories();});
 update();loadCategories();
});
})(typeof window!=='undefined'?window:globalThis);
