/* Shared, fail-closed presentation. Never infer an arrival from a vehicle position. */
(function(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function departureState(d,status,now=Date.now()/1000){
 if(d.canceled)return {kind:'canceled',epoch:finite(d.scheduled_epoch)?d.scheduled_epoch:null};
 const fresh=status==='fresh'&&d.data_type==='realtime'&&finite(d.prediction_at)&&d.prediction_at>=now&&finite(d.prediction_reported_at)&&now-d.prediction_reported_at>=-60&&now-d.prediction_reported_at<=180&&(d.uncertainty_seconds==null||(finite(d.uncertainty_seconds)&&d.uncertainty_seconds>=0&&d.uncertainty_seconds<=120));
 if(fresh)return {kind:d.prediction_kind==='arrival'?'arrival':'departure',epoch:d.prediction_at};
 return finite(d.scheduled_epoch)?{kind:'scheduled',epoch:d.scheduled_epoch}:{kind:'unknown',epoch:null};
}
function alertTiming(periods,now=Date.now()/1000){
 if(!Array.isArray(periods)||!periods.length)return 'undated';
 if(periods.every(p=>finite(p.end)&&p.end>0&&p.end<=now))return 'expired';
 if(periods.every(p=>finite(p.start)&&p.start>now))return 'upcoming';
 if(periods.some(p=>(!finite(p.start)||p.start<=now)&&(!finite(p.end)||p.end>now)))return periods.every(p=>!finite(p.start)&&!finite(p.end))?'undated':'ongoing';
 return 'undated';
}
function normalizeAlerts(alerts,route='',now=Date.now()/1000){
 const seen=new Set();return (Array.isArray(alerts)?alerts:[]).filter(a=>{
  if(!a||alertTiming(a.active_periods,now)==='expired')return false;
  const affected=Array.isArray(a.affected)?a.affected:[];
  const routes=a.relevant_routes||[...new Set(affected.map(x=>x.route_id).filter(Boolean))];
  if(route&&a.systemwide!==true&&(routes.length||a.systemwide===false)&&!routes.some(r=>r.toUpperCase()===route.toUpperCase()))return false;
  const key=a.id||JSON.stringify([a.header,a.description,a.active_periods]);if(seen.has(key))return false;seen.add(key);return true;
 }).map(a=>({...a,timing:alertTiming(a.active_periods,now),routes:[...new Set((a.affected||[]).map(x=>x.route_id).filter(Boolean))],stops:[...new Set((a.affected||[]).map(x=>x.stop_id).filter(Boolean))]}));
}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function sourceText(items,language){const list=Array.isArray(items)?items:[];return list.find(x=>(x.language||'').split('-')[0]===language)||list[0]||{text:'',language};}
function renderAlerts(host,data,route='',language='en'){
 const doc=host.ownerDocument,es=language==='es',t=(a,b)=>es?b:a;
 const rows=normalizeAlerts(data.alerts,route);const sourceEpoch=data.feed_timestamp||data.retrieved_at;const sourceAge=finite(sourceEpoch)?Date.now()/1000-sourceEpoch:null;const fresh=data.status==='fresh'&&(sourceAge===null||sourceAge>=-60&&sourceAge<=180);host.replaceChildren();
 const summary=doc.createElement('summary');summary.className='alert-summary';summary.textContent=t('Service alerts','Avisos de servicio')+((data.status!=='fresh'&&!rows.length&&!data.received_at)?t(' — unavailable',' — no disponibles'):` (${rows.length})`);host.append(summary);
 const note=doc.createElement('p');note.className='status-note';note.textContent=fresh?t('Official MCTS notices.','Avisos oficiales de MCTS.'):t('Service alert feed unavailable or outdated. Last known notices may be stale; check MCTS before traveling.','Los avisos no están disponibles o están desactualizados. Consulta MCTS antes de viajar.');host.append(note);
 const stamp=doc.createElement('p');stamp.className='status-note';const epoch=data.feed_timestamp||data.retrieved_at;if(Number.isFinite(epoch)&&epoch>0){stamp.textContent=t('Source updated: ','Actualización de origen: ')+new Date(epoch*1000).toLocaleString(es?'es-US':'en-US',{timeZone:'America/Chicago'});host.append(stamp);}host.dataset.snapshot=String(epoch||'unknown');host.dataset.filter=route;
 if(!rows.length&&fresh){const p=doc.createElement('p');p.textContent=t('No relevant notices returned. This is not a guarantee of normal service.','No se devolvieron avisos relevantes. No garantiza un servicio normal.');host.append(p);}
 for(const a of rows){
  const article=doc.createElement('article');article.className='service-alert';host.append(article);
  const header=sourceText(a.header,language),description=sourceText(a.description,language);
  const h=doc.createElement('h3');h.textContent=header.text||t('MCTS notice','Aviso de MCTS');h.dataset.noTranslate='true';h.lang=header.language||language;article.append(h);
  const chips=doc.createElement('div');chips.className='alert-routes';for(const route of a.routes){const chip=doc.createElement('span');chip.className='route-badge';chip.textContent=route;chips.append(chip);}article.append(chips);
  const timing=doc.createElement('p');timing.className='status-note';timing.textContent=({ongoing:t('Ongoing','En curso'),upcoming:t('Upcoming','Próximo'),undated:t('Dates not supplied','Fechas no indicadas')})[a.timing];
  const periods=(a.active_periods||[]).filter(p=>finite(p.start)||finite(p.end));if(periods.length){const format=v=>new Date(v*1000).toLocaleDateString(es?'es-US':'en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric'});timing.textContent+=' · '+periods.map(p=>`${finite(p.start)?format(p.start):t('Start unknown','Inicio desconocido')} – ${finite(p.end)?format(p.end):t('Until further notice','Hasta nuevo aviso')}`).join('; ');}article.append(timing);
  const detail=doc.createElement('details'),s=doc.createElement('summary');s.textContent=t('Details','Detalles');detail.append(s);const p=doc.createElement('p');p.className='alert-description';p.textContent=description.text||header.text;p.dataset.noTranslate='true';p.lang=description.language||language;detail.append(p);
  const link=safeUrl(sourceText(a.url,language).text);if(link){const anchor=doc.createElement('a');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=t('Official source','Fuente oficial');detail.append(anchor);}article.append(detail);
 }
 return rows.length;
}
const api={departureState,alertTiming,normalizeAlerts,safeUrl,renderAlerts};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root.document)root.AyoTransit=api;
})(typeof window!=='undefined'?window:globalThis);
