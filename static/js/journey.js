/* Rider-facing planner. The engine owns IDs/times; the UI owns no transit estimates. */
(function (root) {
  'use strict';
  const units = root.AyoUnits || (typeof module !== 'undefined' && module.exports ? require('./units.js') : null);
  const tr = (es, en, spanish) => es ? spanish : en;
  const validPoint=p=>p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
  const duration = seconds => `${Math.max(0, Math.ceil(seconds / 60))} min`;
  function itineraryExpired(data, now = Date.now()/1000) {
    const deadline = data.valid_until ?? Math.min(data.departure, (data.requested_at || now)+300);
    return Number.isFinite(deadline) && now >= deadline;
  }
  function searchFailure(error, es, hostname) {
    if (error.status === 404) {
      return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname)
        ? tr(es, 'This local server is missing stop search. Restart it with the latest project code, then reload this page.',
          'Este servidor local no tiene la búsqueda de paradas. Reinícialo con el código actualizado y recarga esta página.')
        : tr(es, 'Stop search is being updated. Reload the page or use the official MCTS planner.',
          'La búsqueda se está actualizando. Recarga la página o usa el planificador oficial de MCTS.');
    }
    if (error.status === 429) return tr(es, 'Too many searches. Wait a minute, then try again.', 'Demasiadas búsquedas. Espera un minuto e inténtalo de nuevo.');
    if (error.status >= 500 || error.code === 'invalid_response') return tr(es,
      'Stop data is temporarily unavailable. Try again shortly or use the official MCTS planner.',
      'Los datos de paradas no están disponibles. Inténtalo más tarde o usa el planificador oficial de MCTS.');
    return tr(es, 'Stop search is unavailable. Check your connection and try again.', 'La búsqueda no está disponible. Revisa tu conexión e inténtalo de nuevo.');
  }
  function journeyFailure(error, es=false) {
    if(error.code==='timeout')return tr(es,'Journey search timed out. Retry, or use the official MCTS planner.','La búsqueda del viaje tardó demasiado. Reinténtalo o usa el planificador oficial de MCTS.');
    if(error.status===429)return tr(es,'Too many journey searches. Wait a minute, then retry.','Demasiadas búsquedas de viajes. Espera un minuto y reinténtalo.');
    if(error.status===400)return tr(es,'Check your selected stops and future Milwaukee departure time, then retry.','Comprueba las paradas elegidas y la hora futura de salida de Milwaukee y reinténtalo.');
    if(error.code==='invalid_response')return tr(es,'Journey data is incomplete or unavailable. Retry or use the official planner.','Los datos del viaje están incompletos o no disponibles. Reinténtalo o usa el planificador oficial.');
    return tr(es,'Journey search is unavailable or exceeded its limits. Try again, choose another stop, or use the official planner.','La búsqueda no está disponible o superó sus límites. Inténtalo de nuevo, elige otra parada o usa el planificador oficial.');
  }
  function timeLabel(epoch, es = false) {
    return new Intl.DateTimeFormat(es ? 'es-US' : 'en-US', {
      timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(new Date(epoch * 1000));
  }
  function walkingLink(leg) {
    const a = leg.from_stop, b = leg.to_stop;
    return `https://www.google.com/maps/dir/?api=1&origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}&travelmode=walking`;
  }
  function chicagoDeparture(value) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Choose a valid Milwaukee departure time');
    const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const candidates=[5,6].map(h=>new Date(Date.parse(value+'Z')+h*3600000)).filter(d=>parts.format(d).replace(' ','T')===value);
    if(candidates.length!==1)throw Error('This time is invalid or ambiguous during the clock change. Choose another time.');
    return candidates[0].toISOString();
  }
  function mount(document, win) {
    const panel = document.querySelector('#journey .journey-panel');
    if (!panel) return;
    const es = document.documentElement.lang === 'es';
    const t = (a, b) => tr(es, a, b);
    const add = (tag, text, parent, cls) => {
      const n = document.createElement(tag);
      if (text) n.textContent = text;
      if (cls) n.className = cls;
      if (parent) parent.append(n);
      return n;
    };
    const resultMaps=[];function clearResultMaps(){for(const dispose of resultMaps.splice(0))dispose();}
    let version = 0, request = null, mapLayer = null, itinerary = null, choice=0, mapSuppressed=false;
    panel.replaceChildren();
    panel.classList.add('journey-experience');
    add('p', t('Your next ride starts here.', 'Tu próximo viaje empieza aquí.'), panel, 'journey-kicker');
    const providerNote=add('p',t('Search official stops and intersections. Full addresses and places require a configured geocoder.','Busca paradas y cruces oficiales. Direcciones y lugares requieren un geocodificador configurado.'),panel,'journey-provider-note');
    win.AyoLocationSearch?.ready?.then(()=>{if(win.AyoLocationSearch.placesAvailable)providerNote.textContent=t('Official stop suggestions appear as you type. Submit Search places to use the configured address provider.','Las paradas oficiales aparecen al escribir. Pulsa Buscar lugares para usar el proveedor de direcciones.');});
    const form = add('form', '', panel);
    const fields = add('div', '', form, 'journey-search-grid');
    const modeLabel=add('label',t('Travel time','Hora de viaje'),form);const mode=add('select','',form);mode.id='journeyTimeMode';modeLabel.htmlFor=mode.id;for(const [value,label]of [['now',t('Leave now','Salir ahora')],['depart',t('Depart at','Salir a las')],['arrive',t('Arrive by','Llegar antes de')]]){const o=add('option',label,mode);o.value=value;}
    const timePills=add('div','',form,'journey-time-pills');timePills.setAttribute('role','group');timePills.setAttribute('aria-label',t('Departure time','Hora de salida'));for(const value of ['now','depart']){const b=add('button',value==='now'?t('Leave now','Salir ahora'):t('Depart at','Salir a las'),timePills);b.type='button';b.dataset.timeMode=value;b.setAttribute('aria-pressed',String(value==='now'));b.onclick=()=>{mode.value=value;mode.dispatchEvent(new Event('change'));};}
    const whenLabel=add('label',t('Departure date and time','Fecha y hora de salida'),form);const when=add('input','',whenLabel);when.type='datetime-local';when.id='journeyDepartAt';whenLabel.hidden=true;when.disabled=true;mode.onchange=()=>{for(const b of timePills.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.timeMode===mode.value));whenLabel.hidden=mode.value==='now';when.disabled=mode.value==='now';if(mode.value==='now')when.value='';whenLabel.firstChild.textContent=mode.value==='arrive'?t('Arrival date and time · Milwaukee','Fecha y hora de llegada · Milwaukee'):t('Departure date and time · Milwaukee','Fecha y hora de salida · Milwaukee');invalidate();if(mode.value==='arrive')status.textContent=t('Arrive by is not supported by this routing engine. Use the official MCTS planner; no departure search will be substituted.','Este motor no admite Llegar antes de. Usa el planificador oficial de MCTS; no se sustituirá por una búsqueda de salida.');};when.onchange=invalidate;
    add('p',t('All times use Milwaukee time. Arrive by requires the official planner.','Las horas corresponden a Milwaukee. Llegar antes de requiere el planificador oficial.'),form,'tiny-note');
    const walkingLabel=add('label','',form,'journey-walking-choice');const walking=add('input','',walkingLabel);walking.type='checkbox';walking.id='allowEstimatedWalking';walking.checked=true;add('span',t('Include walking connections','Incluir conexiones a pie'),walkingLabel);walking.addEventListener('change',invalidate);
    const help=add('details','',form,'journey-planning-help');add('summary',t('ⓘ How trips are planned','ⓘ Cómo se planifican los viajes'),help);help.append(providerNote);const timeHint=form.querySelector(':scope>.tiny-note');if(timeHint)help.append(timeHint);add('p',t('Scheduled service, up to one transfer. Walking connections use straight-line estimates; access walking and pedestrian accessibility are not verified.','Servicio programado, hasta un transbordo. Las conexiones a pie se estiman en línea recta; no se verifica el acceso peatonal ni la accesibilidad.'),help,'tiny-note');const arriveChoice=add('button',t('Arrive by','Llegar antes de'),help);arriveChoice.type='button';arriveChoice.onclick=()=>{mode.value='arrive';mode.dispatchEvent(new Event('change'));};
    const recent=add('section','',form,'journey-recent');recent.setAttribute('aria-label',t('Saved & Recent','Guardado y reciente'));
    const status = add('p', '', form, 'journey-status');
    status.id = 'journeyStatus';status.tabIndex=0; status.setAttribute('role', 'status');
    const submit = add('button', t('Find my journey', 'Buscar mi viaje'), form, 'gold-button');
    submit.type = 'submit'; submit.id = 'planJourney';const dock=add('div','',form,'journey-submit-dock');dock.append(submit);dock.prepend(status);
    add('p', t('Scheduled service • Up to one transfer • Times shown in Milwaukee time. Walking distances are straight-line estimates; no pedestrian route or accessibility is verified.',
      'Servicio programado • Hasta un transbordo • Hora de Milwaukee. Las distancias a pie son estimaciones en línea recta; no se verifica la ruta peatonal ni la accesibilidad.'), panel, 'tiny-note');
    const official = add('a', t('Need an address search or more travel options? Open the official MCTS planner.',
      '¿Buscas una dirección u otras opciones? Abre el planificador oficial de MCTS.'), panel);
    official.href = 'https://www.ridemcts.com/trip-planner'; official.target = '_blank'; official.rel = 'noopener noreferrer';
    const results = add('section', '', panel, 'journey-results');
    results.id = 'journeyResults'; results.setAttribute('aria-label', t('Journey results', 'Resultados del viaje'));
    const freshness = add('p', '', panel, 'journey-freshness'); freshness.setAttribute('role','status');results.before(freshness);
    function updateExpiry() {
      const expired = !!(itinerary && itinerary.legs.length && itineraryExpired(itinerary));
      freshness.textContent = expired
        ? t('This itinerary has expired. Search again before traveling; scheduled connections may no longer be reachable.',
          'Este itinerario ha caducado. Busca de nuevo antes de viajar; quizá ya no alcances las conexiones.') : '';
      results.dataset.expired=String(expired);
      results.querySelectorAll('[data-requires-current]').forEach(button=>button.disabled=expired);
      if(expired){clearMap();clearResultMaps();}
    }
    win.setInterval(updateExpiry, 15000);
    document.addEventListener('visibilitychange', updateExpiry);
    function clearMap() { if (mapLayer) mapLayer.remove(); mapLayer = null; }
    function invalidate(reset=true) {
      if(reset)choice=0;
      version++; if (request) request.abort(); request = null;
      clearMap();clearResultMaps(); itinerary = null; results.replaceChildren(); status.textContent = ''; submit.disabled = false;
      freshness.textContent = '';
      results.removeAttribute('aria-busy');
    }
    async function get(url, signal) {
      const controller=new AbortController(),cancel=()=>controller.abort();
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
      let timedOut=false;const timeout=win.setTimeout(()=>{timedOut=true;controller.abort();},20000);
      try{
        const response=await win.fetch(url,{signal:controller.signal,cache:'no-store'});
        if(!response.ok){const error=Error(`AYO API returned HTTP ${response.status}`);error.status=response.status;throw error;}
        try{return await response.json();}catch(error){if(controller.signal.aborted)throw error;throw Object.assign(Error('Invalid API response'),{code:'invalid_response'});}
      }catch(error){if(timedOut&&!signal?.aborted)throw Object.assign(Error('Request timed out'),{code:'timeout'});throw error;}
      finally{win.clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
    }
    function locationField(id, english, spanish) {
      const box = add('div', '', fields, 'journey-location');box.dataset.field=id;
      const label = add('label', t(english, spanish), box); label.htmlFor = id;
      const input = add('input', '', box); input.id = id; input.type = 'text';
      input.placeholder = id==='planFrom'?t('From: stop, address, or place','Origen: parada, dirección o lugar'):t('To: stop, address, or place','Destino: parada, dirección o lugar');
      input.autocomplete = 'off'; input.maxLength = 80;
      input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', `${id}-list`);
      const list = add('ul', '', box, 'journey-suggestions'); list.id = `${id}-list`;
      list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', t(`${english} suggestions`, `Sugerencias: ${spanish}`)); list.hidden = true;
      const info = add('p', '', box, 'journey-location-info'); info.id = `${id}-info`;info.tabIndex=0; info.setAttribute('role', 'status');
      input.setAttribute('aria-describedby', info.id);
      const placeSearch=add('button',t('Search places','Buscar lugares'),box,'journey-place-search');placeSearch.type='button';placeSearch.setAttribute('aria-label',placeSearch.textContent);placeSearch.addEventListener('pointerdown',event=>event.preventDefault());
      const locate = add('button', t('Use My Location', 'Usar mi ubicación'), box, 'favorite-chip journey-locate'); locate.type = 'button';locate.setAttribute('aria-label',locate.textContent);
      let accessPoint=null;let chosen = null, candidates = [], active = -1, serial = 0, timer, controller, locationAccuracy=null;
      function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
      function cancel() { serial++; clearTimeout(timer); if (controller) controller.abort(); }
      function select(stop) {
        cancel();accessPoint=accessPoint||stop.access_point||null;chosen = accessPoint?{...stop,access_point:accessPoint}:stop; input.value = accessPoint?accessPoint.name+' · '+stop.name:stop.name; close(); invalidate();
        info.textContent = stop.distance_meters == null ? t('Stop selected.', 'Parada seleccionada.') :
          t(`Stop selected, approximately ${units.distance(stop.distance_meters, es ? 'es' : 'en')} from the selected location in a straight line. Your journey starts or ends at this stop; access walking time is not included.`,
            `Parada seleccionada, a unos ${units.distance(stop.distance_meters, es ? 'es' : 'en')} en línea recta. El viaje empieza o termina en esta parada; no incluye el tiempo para llegar a pie.`);
        input.focus({preventScroll:true});win.dispatchEvent(new CustomEvent('ayo:planner-location-selected',{detail:{field:id,stop}}));
      }
      function show(stops) {
        candidates = stops; active = -1; list.replaceChildren();
        for (const [index, stop] of stops.entries()) {
          const li = add('li', '', list); li.setAttribute('role', 'presentation');
          const option = add('button', stop.name, li); option.type = 'button'; option.id = `${id}-option-${index}`;
          option.tabIndex = -1; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
          add('small', stop.stop_id?`${t('Stop','Parada')} ${stop.stop_id}`:t('Verified address / place','Dirección / lugar verificado'), option);
          if (stop.description) add('small', stop.description, option);
          for(const service of stop.scheduled_directions || [])add('small',`${t('Route','Ruta')} ${service.route_number} → ${service.headsign}`,option);
          if (stop.distance_meters != null) add('small', t(`≈ ${units.distance(stop.distance_meters, es ? 'es' : 'en')} straight-line distance`, `≈ ${units.distance(stop.distance_meters, es ? 'es' : 'en')} en línea recta`), option);
          option.addEventListener('pointerdown', e => e.preventDefault());
          option.addEventListener('click', () => accept(stop));
        }
        list.hidden = !stops.length; input.setAttribute('aria-expanded', String(!!stops.length));
      }
      async function search(url, token, nearby) {
        controller = new AbortController();
        try {
          const data = await get(url, controller.signal);if(Array.isArray(data.stops))data.locations=data.stops;
          if (token !== serial) return;
          if (!Array.isArray(data.locations) || data.locations.some(s =>
            typeof s.stop_id !== 'string' || typeof s.name !== 'string' || !validPoint(s))) {
            const error = Error('Invalid stop-search response'); error.code = 'invalid_response'; throw error;
          }
          show(data.locations);
          info.textContent = data.locations.length ? (nearby&&accessPoint?t('Choose a nearby platform. Planning starts or ends at that stop; access walking is not included.','Elige una parada cercana. El viaje empieza o termina allí; no incluye llegar a pie.'):t('Choose a stop below. Use arrow keys and Enter.', 'Elige una parada. Usa las flechas y Enter.')) :
            nearby ? t(`No MCTS stops found within ${units.miles(1.5, 'en')}. Search by stop name instead.`, `No hay paradas MCTS en ${units.miles(1.5, 'es')}. Busca por nombre.`) :
              t('No matching stop names. Try a street or intersection, or use the official planner for addresses.', 'No hay paradas con ese nombre. Prueba una calle o cruce, o usa el planificador oficial para direcciones.');
          if(nearby&&Number.isFinite(locationAccuracy)&&locationAccuracy>200)info.textContent+=' '+t(`Location accuracy is about ${units.feet(locationAccuracy, es ? 'es' : 'en')}. Confirm the stop manually; proximity may be inaccurate.`,`La precisión de ubicación es de unos ${units.feet(locationAccuracy, es ? 'es' : 'en')}. Confirma la parada; la cercanía puede ser imprecisa.`);
        } catch (error) {
          if (token !== serial || error.name === 'AbortError') return;
          close(); info.textContent = searchFailure(error, es, win.location.hostname);
          win.console.warn('AYO stop search failed', {status: error.status || null, code: error.code || error.name});
        }
      }
      input.addEventListener('input', () => {
        cancel(); accessPoint=null;chosen = null; close(); invalidate();win.dispatchEvent(new CustomEvent('ayo:planner-location-selected',{detail:{field:id,stop:null}}));
        if (input.value.trim().length < 2&&!/^\d+$/.test(input.value.trim())) { info.textContent = t('Type at least two letters.', 'Escribe al menos dos letras.'); return; }
        info.textContent = t('Searching stops…', 'Buscando paradas…'); const token = serial;
        const query=input.value.trim();timer = setTimeout(() => search((/^\d+$/.test(query)?'/api/explore/stops?q=':'/api/journey-locations?q=') + encodeURIComponent(query), token, false), 250);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { cancel(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        if (!candidates.length || list.hidden) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          active = active < 0 ? (step > 0 ? 0 : candidates.length - 1) : (active + step + candidates.length) % candidates.length;
          [...list.querySelectorAll('[role=option]')].forEach((n, i) => n.setAttribute('aria-selected', String(i === active)));
          input.setAttribute('aria-activedescendant', `${id}-option-${active}`);
          const option=document.getElementById(`${id}-option-${active}`);const top=option.offsetTop,bottom=top+option.offsetHeight;if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
        } else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); accept(candidates[active]); }
      });
      // Keep the list's layout stable between pointerdown and click. Hiding it
      // on blur can move the location/submit button away from the pointer.
      input.addEventListener('blur', cancel);
      document.addEventListener('click', event => {
        if (!box.contains(event.target)) { cancel(); close(); }
      });
      locate.addEventListener('click', async () => {
        cancel();accessPoint=null; chosen = null; input.value = ''; close(); invalidate();

        const token = serial; locate.disabled = true;locationAccuracy=null;
        info.textContent = t('Finding your location…', 'Buscando tu ubicación…');
        try { const shared=id==='planFrom'?(win.AyoHome?.location||win.state?.selectedLocation):null;const position=shared?{coords:{...shared,accuracy:null}}:await win.AyoLocation.request({es});
          locate.disabled = false; if (token !== serial) return;
          locationAccuracy=position.coords.accuracy;accessPoint={latitude:position.coords.latitude,longitude:position.coords.longitude,name:shared?.name||t('Current location','Ubicación actual'),kind:shared?.kind||'gps'};
          info.textContent = t('Finding nearby stops…', 'Buscando paradas cercanas…');
          search(`/api/journey-locations?lat=${encodeURIComponent(position.coords.latitude)}&lon=${encodeURIComponent(position.coords.longitude)}`, token, true);
        } catch(error) { locate.disabled=false;if(token===serial)info.textContent=error.message; }
      });
      async function accept(location){
        if(location.stop_id){select(location);return;}
        if(!validPoint(location)){info.textContent=t('Location coordinates are unavailable.','Las coordenadas no están disponibles.');return;}
        cancel();accessPoint={...location};chosen=null;input.value=location.name;invalidate();close();
        const token=serial;info.textContent=t('Choose a nearby boarding or destination stop. Door-to-door walking is not included.','Elige una parada cercana de subida o destino. No se incluye caminar de puerta a puerta.');
        await search(`/api/journey-locations?lat=${encodeURIComponent(location.latitude)}&lon=${encodeURIComponent(location.longitude)}`,token,true);
      }
      placeSearch.onclick=async()=>{
        cancel();close();const token=serial,query=input.value.trim();if(query.length<2){info.textContent=t('Type a location first.','Escribe primero una ubicación.');return;}
        await win.AyoLocationSearch?.ready;if(token!==serial)return;
        if(!win.AyoLocationSearch?.placesAvailable){info.textContent=t('Full address/place lookup is not configured. Search official stops or intersections instead.','La búsqueda de direcciones y lugares no está configurada. Busca paradas o cruces oficiales.');return;}
        controller=new AbortController();info.textContent=t('Searching verified places…','Buscando lugares verificados…');
        try{const places=await win.AyoLocationSearch.searchPlaces(query,{consent:true,signal:controller.signal});if(token!==serial)return;show([...new Map(places.filter(validPoint).map(p=>[`${p.latitude}|${p.longitude}|${p.name}`,p])).values()]);info.textContent=places.length?t('Choose a location, then confirm an official nearby stop. © OpenStreetMap contributors.','Elige una ubicación y confirma una parada oficial cercana. © OpenStreetMap contributors.'):t('No matching places. Try another address or official stop.','No se encontraron lugares. Prueba otra dirección o parada oficial.');const credit=add('a',' · Powered by Geoapify',info);credit.href='https://www.geoapify.com/';credit.target='_blank';credit.rel='noopener';}
        catch(error){if(token===serial&&error.name!=='AbortError')info.textContent=t('Place search unavailable. Official-stop search remains available.','La búsqueda de lugares no está disponible. Puedes buscar paradas oficiales.');}
      };
      const choices=add('div','',box,'journey-origin-choices');choices.hidden=true;
      if(id==='planFrom'){
        const gps=add('button',t('Use My Current Location','Usar mi ubicación actual'),choices);gps.type='button';gps.onclick=()=>{choices.hidden=true;locate.click();};
        const manual=add('button',t('Enter Location Manually','Introducir ubicación manualmente'),choices);manual.type='button';manual.onclick=()=>{input.focus({preventScroll:true});choices.hidden=true;};
        input.addEventListener('focus',()=>{if(!input.value)choices.hidden=false;});input.addEventListener('input',()=>choices.hidden=true);
      }
      document.addEventListener('click',event=>{if(!box.contains(event.target))choices.hidden=true;});
      return {input, selected: () => chosen, select, resetAccess(){accessPoint=null;}};
    }
    const from = locationField('planFrom', 'From', 'Origen');
    const to = locationField('planTo', 'To', 'Destino');
    const swap=add('button',t('Swap From and To','Intercambiar origen y destino'),form,'favorite-chip');swap.type='button';swap.classList.add('journey-swap');swap.setAttribute('aria-label',swap.textContent);fields.insertBefore(swap,to.input.parentNode);swap.onclick=()=>{const a=from.selected(),b=to.selected();if(!a||!b){status.textContent=t('Choose both stops before swapping.','Elige ambas paradas antes de intercambiar.');return;}from.resetAccess();to.resetAccess();from.select(b);to.select(a);};
    win.addEventListener('ayo:planner-context',e=>{if(e.detail.from&&from.selected()?.stop_id!==e.detail.from.stop_id){from.resetAccess();from.select(e.detail.from);}if(e.detail.to&&to.selected()?.stop_id!==e.detail.to.stop_id){to.resetAccess();to.select(e.detail.to);}if(e.detail.freshSearch){invalidate();form.requestSubmit();}});
    function renderRecent(){
      recent.replaceChildren();add('h2',t('Saved & Recent','Guardado y reciente'),recent);
      let saved={},history=[];try{saved=JSON.parse(localStorage.getItem('ayo-workspace-favorites')||'{}');history=JSON.parse(sessionStorage.getItem('ayo-trip-recent-v1')||'[]');}catch{}
      const rows=[...(Array.isArray(saved.stops)?saved.stops:[]).map(s=>({id:s.id,name:s.name,saved:true})),...(Array.isArray(saved.journeys)?saved.journeys:[]).filter(j=>j.to?.stop_id).map(j=>({id:j.to.stop_id,name:j.to.name,saved:true})),...(Array.isArray(history)?history:[])];
      const destinations=new Map();for(const row of rows){if(typeof row.id==='string'&&row.id&&typeof row.name==='string'&&!destinations.has(row.id))destinations.set(row.id,row);}const unique=[...destinations.values()].slice(0,5);
      if(!unique.length)add('p',t('Your saved stops and recent destinations will appear here.','Tus paradas guardadas y destinos recientes aparecerán aquí.'),recent,'tiny-note');
      for(const row of unique){const b=add('button','',recent,'journey-recent-chip');b.type='button';add('span',row.saved?'☆':'◷',b,'journey-recent-icon').setAttribute('aria-hidden','true');const labels=add('span','',b,'journey-recent-labels');add('strong',row.name,labels);add('small',row.saved?t('Saved destination','Destino guardado'):t('Recent','Reciente'),labels);add('span','›',b,'journey-recent-arrow').setAttribute('aria-hidden','true');b.onclick=async()=>{b.disabled=true;invalidate();status.textContent=t('Checking saved destination…','Comprobando el destino guardado…');const token=version;try{const stop=await get('/api/explore/stops/'+encodeURIComponent(row.id));if(token!==version)return;if(!stop.stop_id||!validPoint(stop))throw Error('Invalid stop');to.resetAccess();to.select(stop);status.textContent=t('Destination selected: ','Destino elegido: ')+stop.name;}catch{status.textContent=t('Saved destination unavailable. Search for it again.','El destino guardado no está disponible. Búscalo de nuevo.');}finally{b.disabled=false;}};}
    }
    function rememberDestination(stop){try{const rows=JSON.parse(sessionStorage.getItem('ayo-trip-recent-v1')||'[]');sessionStorage.setItem('ayo-trip-recent-v1',JSON.stringify([{id:stop.stop_id,name:stop.name},...(Array.isArray(rows)?rows:[]).filter(r=>r.id!==stop.stop_id)].slice(0,5)));}catch{}renderRecent();}
    win.addEventListener('ayo:favorites-changed',renderRecent);renderRecent();
    let routeSuppressed=false;
    win.addEventListener('ayo:route-selected',event=>{if(!event.detail?.journey){routeSuppressed=true;clearMap();}});
    function drawMap(data) {
      if(mapSuppressed||routeSuppressed)return false;
      clearMap();
      if (!win.state?.map || !win.L) return false;
      const L = win.L, map = win.state.map; mapLayer = L.featureGroup().addTo(map);
      const colors = ['#e9bd7a', '#76c9e8']; let ride = 0;
      for (const leg of data.legs) {
        if (leg.type === 'bus' && leg.geometry.length > 1) L.polyline(leg.geometry, {color: colors[ride++ % colors.length], weight: 5, opacity: 0.8}).addTo(mapLayer);
        for (const stop of [leg.from_stop, leg.to_stop]) {
          L.circleMarker([stop.latitude, stop.longitude], {radius: 7, color: '#fff', fillColor: '#203448', fillOpacity: 1})
            .bindPopup(add('span', stop.name)).addTo(mapLayer);
        }
      }
      if (mapLayer.getLayers().length) map.fitBounds(mapLayer.getBounds(), {padding: [30, 30], maxZoom: 15});
      return true;
    }
    win.addEventListener('ayo:feature-opened',e=>{mapSuppressed=e.detail.feature!=='planner';if(mapSuppressed)clearMap();else if(itinerary?.legs.length)win.requestAnimationFrame(()=>{if(itinerary?.legs.length)drawMap(itinerary);});});
    function render(data) {
      routeSuppressed=false;
      clearResultMaps();results.replaceChildren();
      if(data.nearby_trip){
        add('p',t(`These stops are about ${units.distance(data.straight_line_distance_meters, es ? 'es' : 'en')} apart in a straight line. Check the boarding direction: nearby platforms may serve different directions. Large out-and-back detours are excluded. Walking requires opt-in and an actual path check.`,
          `Estas paradas están a unos ${units.distance(data.straight_line_distance_meters, es ? 'es' : 'en')} en línea recta. Comprueba el sentido: las plataformas cercanas pueden servir sentidos distintos. Se excluyen grandes rodeos de ida y vuelta. Caminar requiere tu elección y comprobar el camino real.`),results,'journey-warning');
      }
      for(const [stops,field,origin] of [[data.nearby_origin_stops,from,true],[data.nearby_destination_stops,to,false]]){
        for(const stop of stops || []){
          const label=origin?t('Choose nearby origin','Elegir origen cercano'):t('Choose nearby destination','Elegir destino cercano');
          const button=add('button',`${label}: ${stop.name} · ${t('Stop','Parada')} ${stop.stop_id} · ≈ ${units.distance(stop.distance_meters, es ? 'es' : 'en')} ${t('from selected stop','de la parada elegida')}`,results,'favorite-chip');button.type='button';
          button.addEventListener('click',()=>{field.select(stop);status.textContent=t('Stop changed. Search again to check its scheduled service. Access walking is not included.', 'Parada cambiada. Busca de nuevo para consultar el servicio programado. No incluye llegar a pie.');});
        }
      }
      if (data.status === 'no_route' || !data.legs.length) {
        add('h3', t('No journey found', 'No se encontró un viaje'), results);
        add('p', t('No scheduled connection was found within this search’s limits. This does not mean there is no service. Try another nearby stop or the official MCTS planner.',
          'No se encontró una conexión programada dentro de los límites de búsqueda. Esto no significa que no haya servicio. Prueba otra parada o el planificador oficial.'), results); return;
      }
      win.dispatchEvent(new CustomEvent('ayo:journey-selected',{detail:data}));
      const save=add('button',t('Save Journey','Guardar viaje'),results,'favorite-chip');save.type='button';save.onclick=()=>{try{win.AyoWorkspaces.saveJourney(data.origin,data.destination);status.textContent=t('Journey pair saved on this device.','Trayecto guardado en este dispositivo.');}catch(e){status.textContent=e.message;}};
      const firstBus=data.legs.find(l=>l.type==='bus');
      if(firstBus){const alert=add('button',t('Set Departure Alert','Crear aviso de salida'),results,'favorite-chip');alert.type='button';alert.dataset.requiresCurrent='true';alert.onclick=()=>{const bus=data.legs.find(l=>l.type==='bus');return win.AyoWorkspaces.open('alerts',{stop:bus?.from_stop||data.origin,departure:bus?{trip_id:bus.trip_id,service_date:bus.service_date,route_id:bus.route}:null});};}
      if(data.choices_available>1){const other=add('button',t('Other journey option','Otra opción de viaje'),results,'favorite-chip');other.type='button';other.onclick=()=>{choice=(data.selected_choice+1)%data.choices_available;form.requestSubmit();};}
      add('p',data.legs.every(leg=>leg.type==='walk')?t('Estimated walking connection; not a scheduled bus journey.','Conexión a pie estimada; no es un viaje de autobús programado.'):t('Scheduled timetable · not a live arrival prediction. Earliest/fastest results are not guaranteed by this bounded routing engine.','Horario programado · no es una predicción de llegada en vivo. Este motor limitado no garantiza el viaje más temprano o rápido.'),results,'journey-source-note');
      add('h3', `${data.origin.name} → ${data.destination.name}`, results);
      const walkingOnly = data.legs.every(leg=>leg.type==='walk');
      const transfers = walkingOnly ? t('Estimated walk only', 'Solo caminata estimada') : data.transfers ? `${data.transfers} ${data.transfers === 1 ? t('transfer', 'transbordo') : t('transfers', 'transbordos')}` : t('Direct journey', 'Viaje directo');
      add('p', `${data.duration_seconds===0&&!walkingOnly?t('Same published minute; travel duration unavailable','Mismo minuto publicado; duración no disponible'):duration(data.duration_seconds)} · ${transfers}${data.walking_estimated ? t(' · includes estimated walking time', ' · incluye caminata estimada') : ''}`, results, 'journey-summary');
      add('p', `${walkingOnly?t('Estimated start','Inicio estimado'):t('Scheduled departure', 'Salida programada')}: ${timeLabel(data.departure, es)} · ${walkingOnly?t('Estimated arrival','Llegada estimada'):t('Arrival', 'Llegada')}: ${timeLabel(data.arrival, es)}`, results);
      if(walkingOnly)add('p',t('This is an estimated connection between the selected stops, not a verified pedestrian route or scheduled bus service.','Esta conexión entre las paradas es estimada; no es una ruta peatonal verificada ni servicio de autobús programado.'),results,'tiny-note');
      else add('p', t(`${data.requested_departure_at?'From requested time':'At search time'}: about ${duration(data.initial_wait_seconds)} until departure from the selected origin stop. Travel duration includes transfers; getting to the first stop is not included.`,
        `${data.requested_departure_at?'Desde la hora solicitada':'Al buscar'}: unos ${duration(data.initial_wait_seconds)} hasta la salida desde la parada elegida. La duración incluye transbordos; no incluye llegar a la primera parada.`), results, 'tiny-note');
      const details=add('details','',results,'journey-result-card');const summary=add('summary','',details);add('strong',data.legs.filter(l=>l.type==='bus').map(l=>l.route_number||l.route).join(' → ')||t('Estimated walk','Caminata estimada'),summary);add('span',(walkingOnly?t('Estimated · ','Estimado · '):t('Scheduled · ','Programado · '))+duration(data.duration_seconds),summary);if(firstBus)add('p',(firstBus.headsign||t('Destination unavailable','Destino no disponible'))+' · '+firstBus.from_stop.name,summary);summary.setAttribute('aria-label',t('Journey directions','Indicaciones del viaje'));
      const sourceDetails=add('details','',details,'journey-data-info');add('summary',t('Data freshness','Actualización de datos'),sourceDetails);add('p',t('Schedule searched: ','Horario consultado: ')+(Number.isFinite(data.requested_at)?timeLabel(data.requested_at,es):t('Unavailable','No disponible')),sourceDetails);add('p',walkingOnly?t('Walking is estimated; no pedestrian path is verified.','La caminata es estimada; no se verifica la ruta peatonal.'):t('This planner uses scheduled GTFS service, not live arrival predictions.','Este planificador utiliza el horario GTFS, no predicciones de llegada en vivo.'),sourceDetails);
      const steps = add('ol', '', details, 'journey-steps'); let rides = 0;
      for (const [index, leg] of data.legs.entries()) {
        const li = add('li', '', steps);
        if (leg.type === 'bus') {
          if (rides++) {
            const previous = data.legs[index - 1];
            add('p', t(`Transfer at ${leg.from_stop.name} · ${duration(leg.departure - previous.arrival)} scheduled connection time`,
              `Transbordo en ${leg.from_stop.name} · ${duration(leg.departure - previous.arrival)} de conexión programada`), li, 'journey-transfer');
            if ((leg.transfer_margin_seconds ?? leg.departure-previous.arrival) < 300)
              add('p', t('Tight scheduled connection. Allow extra time; delays or a slower walk could cause a missed bus.',
                'Conexión programada ajustada. Reserva más tiempo; un retraso o una caminata lenta podría hacerte perder el autobús.'), li, 'journey-warning');
          }
          const track=add('button',t(`Track Route ${leg.route_number}`,`Seguir ruta ${leg.route_number}`),li,'favorite-chip');track.type='button';track.dataset.requiresCurrent='true';track.onclick=()=>win.AyoWorkspaces.open('tracking',{route:leg.route});
          add('h4', t(`Take Route ${leg.route_number} toward ${leg.headsign || t('Destination not supplied','Destino no indicado')}`,
            `Toma la ruta ${leg.route_number} hacia ${leg.headsign || t('Destination not supplied','Destino no indicado')}`), li);
          add('p', `${t('Board at', 'Sube en')} ${leg.from_stop.name} · ${timeLabel(leg.departure, es)}`, li);
          add('p', `${t('Get off at', 'Baja en')} ${leg.to_stop.name} · ${timeLabel(leg.arrival, es)} · ${leg.duration_seconds===0?t('Same published minute; travel duration unavailable','Mismo minuto publicado; duración no disponible'):duration(leg.duration_seconds)}`, li);
          if (!leg.geometry.length) add('p', t('GTFS shape unavailable for this trip.', 'No hay trazado GTFS para este viaje.'), li, 'tiny-note');
        } else {
          add('h4', t(`Walking connection: ${leg.from_stop.name} → ${leg.to_stop.name}`,
            `Conexión a pie: ${leg.from_stop.name} → ${leg.to_stop.name}`), li);
          add('p', t(`Approximately ${units.distance(leg.meters, es ? 'es' : 'en')} straight-line distance · ${duration(leg.duration_seconds)} estimated. No walking path or accessibility has been verified.`,
            `Unos ${units.distance(leg.meters, es ? 'es' : 'en')} en línea recta · ${duration(leg.duration_seconds)} estimados. No se verifica la ruta ni la accesibilidad.`), li);
          add('p', `${t('Estimated connection time', 'Horario estimado de conexión')}: ${timeLabel(leg.departure, es)} → ${timeLabel(leg.arrival, es)}`, li);
          const link = add('a', t('Check walking directions with an external map', 'Consulta indicaciones a pie en un mapa externo'), li);
          link.href = walkingLink(leg); link.target = '_blank'; link.rel = 'noopener noreferrer';
        }
      }
      const boarding=data.legs.find(leg=>leg.type==='bus')?.from_stop;if(boarding&&validPoint(boarding)){const start=from.selected()?.access_point||data.origin;const walk=add('a',t('Walk to Bus Stop','Caminar a la parada'),details,'journey-walk-action');walk.href=walkingLink({from_stop:start,to_stop:boarding});walk.target='_blank';walk.rel='noopener noreferrer';}
      const startJourney=add('button',t('Start My Journey · unavailable','Iniciar mi viaje · no disponible'),details,'favorite-chip');startJourney.type='button';startJourney.disabled=true;add('p',t('Live turn-by-turn journey guidance is not available. Use these scheduled steps and external walking directions.','La guía paso a paso en vivo no está disponible. Usa estas indicaciones programadas y la navegación peatonal externa.'),details,'tiny-note');
      const mapStatus = add('p', t('Map: official GTFS shape points are limited to the ride when source distances allow; otherwise the full trip is shown. Markers show endpoints. Walking paths are not drawn.',
        'Mapa: los puntos GTFS se limitan al tramo si las distancias de origen lo permiten; si no, se muestra el viaje completo. Los marcadores indican los extremos. No se dibujan rutas peatonales.'), results, 'tiny-note');
      const contextual=add('button',t('Show journey map','Ver mapa del viaje'),details,'favorite-chip');contextual.type='button';contextual.dataset.requiresCurrent='true';let localMap=null;
      contextual.onclick=()=>{if(localMap){localMap.remove();localMap=null;details.querySelector('.journey-context-map')?.remove();return;}if(!win.L){mapStatus.textContent=t('Map unavailable; directions remain available.','Mapa no disponible; las indicaciones siguen disponibles.');return;}const host=add('div','',details,'journey-context-map');host.setAttribute('role','region');host.setAttribute('aria-label',t('Scheduled journey map','Mapa del viaje programado'));const L=win.L;localMap=L.map(host,{scrollWheelZoom:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(localMap);const points=[];for(const leg of data.legs){for(const stop of [leg.from_stop,leg.to_stop])if(validPoint(stop)){points.push([stop.latitude,stop.longitude]);L.circleMarker([stop.latitude,stop.longitude],{radius:6,color:'#f0c169'}).addTo(localMap).bindTooltip(add('span',stop.name));}if(leg.type==='bus'&&Array.isArray(leg.geometry)&&leg.geometry.length>1&&leg.geometry.every(p=>Array.isArray(p)&&validPoint({latitude:p[0],longitude:p[1]})))L.polyline(leg.geometry,{color:'#f0c169',weight:4}).addTo(localMap);}if(points.length)localMap.fitBounds(points,{padding:[20,20],maxZoom:15});requestAnimationFrame(()=>localMap?.invalidateSize({pan:false}));};
      resultMaps.push(()=>{localMap?.remove();localMap=null;});
      const view = add('button', t('Show journey on live map', 'Ver viaje en el mapa'), results, 'favorite-chip'); view.type = 'button'; view.dataset.requiresCurrent='true';
      view.addEventListener('click', () => {
        routeSuppressed=false;mapSuppressed=false;
        if (drawMap(data)) { win.trackJourney(data); win.AyoSite?.navigate('map'); }
        else mapStatus.textContent = t('The map is unavailable. Your scheduled journey instructions are still shown above.', 'El mapa no está disponible. Las instrucciones programadas siguen arriba.');
      });
      if (!mapSuppressed&&!drawMap(data)) mapStatus.textContent = t('The map is unavailable. Follow the scheduled instructions above; retry the map when connected.', 'El mapa no está disponible. Consulta las instrucciones y vuelve a intentarlo con conexión.');
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if(mode.value==='arrive'){status.textContent=t('Arrive by is not supported here. Open the official MCTS planner below.','Llegar antes de no está disponible aquí. Abre el planificador oficial de MCTS.');return;}
      const a = from.selected(), b = to.selected();
      if (!a || !b) { status.textContent = t('Choose both locations from the suggestions before searching.', 'Elige ambos lugares de las sugerencias antes de buscar.'); (!a ? from : to).input.focus(); return; }
      if (a.stop_id === b.stop_id) { status.textContent = t('Choose different origin and destination stops.', 'Elige paradas distintas de origen y destino.'); return; }
      let departure='';if(mode.value==='depart'){try{departure=chicagoDeparture(when.value);const delta=Date.parse(departure)-Date.now();if(delta<0||delta>31*86400000)throw Error('outside window');}catch{status.textContent=t('Choose a valid, unambiguous Milwaukee time within the next 31 days.','Elige una hora válida y no ambigua de Milwaukee dentro de los próximos 31 días.');return;}}
      if(!win.AyoWorkspaces?.activeFeature||win.AyoWorkspaces.activeFeature==='planner')mapSuppressed=false;
      invalidate(false); const token = version; request = new AbortController(); submit.disabled = true;
      status.textContent = t('Finding scheduled connections…', 'Buscando conexiones programadas…'); results.setAttribute('aria-busy', 'true');
      try {
        const data = await get(`/api/journeys?from=${encodeURIComponent(a.stop_id)}&to=${encodeURIComponent(b.stop_id)}&walking=${walking.checked?'1':'0'}&choice=${choice}${departure?'&depart_at='+encodeURIComponent(departure):''}`, request.signal);
        if (token !== version) return;
        itinerary = data;rememberDestination(b); render(itinerary); updateExpiry(); status.textContent = data.legs.length ? (data.legs.every(l=>l.type==='walk')?t('Estimated walking connection only. Check the actual path before traveling.','Solo conexión a pie estimada. Comprueba el camino real antes de viajar.'):t('Scheduled journey found. Check service alerts before traveling.', 'Viaje programado encontrado. Consulta los avisos antes de viajar.')) : t('No journey found within the search limits.', 'No se encontró un viaje dentro de los límites.');
      } catch (error) {
        if (token !== version || error.name === 'AbortError') return;
        status.textContent = journeyFailure(error,es);
      } finally {
        if (token === version) { submit.disabled = false; results.removeAttribute('aria-busy'); request = null; }
      }
    });
  }
  const exported = {journeyFailure,validPoint,mount, timeLabel, duration, walkingLink, searchFailure, itineraryExpired,chicagoDeparture};
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root.document) root.document.addEventListener('DOMContentLoaded', () => mount(root.document, root));
})(typeof window !== 'undefined' ? window : globalThis);
