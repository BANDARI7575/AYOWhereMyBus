/* Rider-facing planner. The engine owns IDs/times; the UI owns no transit estimates. */
(function (root) {
  'use strict';
  const tr = (es, en, spanish) => es ? spanish : en;
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
    let version = 0, request = null, mapLayer = null, itinerary = null, choice=0, mapSuppressed=false;
    panel.replaceChildren();
    panel.classList.add('journey-experience');
    add('p', t('Where are you headed?', '¿Adónde vas?'), panel, 'journey-kicker');
    add('p', t('Search MCTS stop or intersection names, then choose a suggestion. Use your location to find nearby departure stops. Street addresses and landmarks are not geocoded.',
      'Busca paradas o cruces de MCTS y elige una sugerencia. Usa tu ubicación para encontrar paradas cercanas. No se buscan direcciones ni lugares de interés.'), panel);
    const form = add('form', '', panel);
    const fields = add('div', '', form, 'journey-search-grid');
    const modeLabel=add('label',t('Travel time','Hora de viaje'),form);const mode=add('select','',form);mode.id='journeyTimeMode';modeLabel.htmlFor=mode.id;for(const [value,label]of [['now',t('Leave Now','Salir ahora')],['depart',t('Depart At (Milwaukee time)','Salir a las (hora de Milwaukee)')]]){const o=add('option',label,mode);o.value=value;}
    const whenLabel=add('label',t('Departure date and time','Fecha y hora de salida'),form);const when=add('input','',whenLabel);when.type='datetime-local';when.id='journeyDepartAt';whenLabel.hidden=true;mode.onchange=()=>{whenLabel.hidden=mode.value!=='depart';invalidate();};when.onchange=invalidate;
    add('p',t('Arrive By and address geocoding are not supported here. Use the official planner for those options.','Llegar antes de y geocodificación no están disponibles aquí. Usa el planificador oficial.'),form,'tiny-note');
    const walkingLabel=add('label','',form,'journey-walking-choice');const walking=add('input','',walkingLabel);walking.type='checkbox';walking.id='allowEstimatedWalking';walking.checked=false;add('span',t('Include estimated walking connections. I will check the actual path; sidewalks, crossings and accessibility are not verified.','Incluir conexiones a pie estimadas. Comprobaré el camino real; no se verifican aceras, cruces ni accesibilidad.'),walkingLabel);walking.addEventListener('change',invalidate);
    const status = add('p', '', form, 'journey-status');
    status.id = 'journeyStatus'; status.setAttribute('role', 'status');
    const submit = add('button', t('Find my journey', 'Buscar mi viaje'), form, 'gold-button');
    submit.type = 'submit'; submit.id = 'planJourney';
    add('p', t('Scheduled service • Up to one transfer • Times shown in Milwaukee time. Walking distances are straight-line estimates; no pedestrian route or accessibility is verified.',
      'Servicio programado • Hasta un transbordo • Hora de Milwaukee. Las distancias a pie son estimaciones en línea recta; no se verifica la ruta peatonal ni la accesibilidad.'), panel, 'tiny-note');
    const official = add('a', t('Need an address search or more travel options? Open the official MCTS planner.',
      '¿Buscas una dirección u otras opciones? Abre el planificador oficial de MCTS.'), panel);
    official.href = 'https://www.ridemcts.com/trip-planner'; official.target = '_blank'; official.rel = 'noopener noreferrer';
    const results = add('section', '', panel, 'journey-results');
    results.id = 'journeyResults'; results.setAttribute('aria-label', t('Journey results', 'Resultados del viaje'));
    const freshness = add('p', '', panel, 'journey-freshness'); freshness.setAttribute('role','status');
    function updateExpiry() {
      freshness.textContent = itinerary && itinerary.legs.length && itineraryExpired(itinerary)
        ? t('This itinerary has expired. Search again before traveling; scheduled connections may no longer be reachable.',
          'Este itinerario ha caducado. Busca de nuevo antes de viajar; quizá ya no alcances las conexiones.') : '';
    }
    win.setInterval(updateExpiry, 15000);
    document.addEventListener('visibilitychange', updateExpiry);
    function clearMap() { if (mapLayer) mapLayer.remove(); mapLayer = null; }
    function invalidate(reset=true) {
      if(reset)choice=0;
      version++; if (request) request.abort(); request = null;
      clearMap(); itinerary = null; results.replaceChildren(); status.textContent = ''; submit.disabled = false;
      freshness.textContent = '';
      results.removeAttribute('aria-busy');
    }
    async function get(url, signal) {
      const response = await win.fetch(url, {signal, cache: 'no-store'});
      if (!response.ok) {
        const error = Error(`AYO API returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    }
    function locationField(id, english, spanish) {
      const box = add('div', '', fields, 'journey-location');
      const label = add('label', t(english, spanish), box); label.htmlFor = id;
      const input = add('input', '', box); input.id = id; input.type = 'text';
      input.placeholder = t('e.g. Wisconsin or 6th', 'Ej. Wisconsin o 6th');
      input.autocomplete = 'off'; input.maxLength = 80;
      input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', `${id}-list`);
      const list = add('ul', '', box, 'journey-suggestions'); list.id = `${id}-list`;
      list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', t(`${english} suggestions`, `Sugerencias: ${spanish}`)); list.hidden = true;
      const info = add('p', '', box, 'journey-location-info'); info.id = `${id}-info`; info.setAttribute('role', 'status');
      input.setAttribute('aria-describedby', info.id);
      const locate = add('button', t('Use My Location', 'Usar mi ubicación'), box, 'favorite-chip journey-locate'); locate.type = 'button';
      let chosen = null, candidates = [], active = -1, serial = 0, timer, controller, locationAccuracy=null;
      function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
      function cancel() { serial++; clearTimeout(timer); if (controller) controller.abort(); }
      function select(stop) {
        cancel(); chosen = stop; input.value = stop.name; close(); invalidate();
        info.textContent = stop.distance_meters == null ? t('Stop selected.', 'Parada seleccionada.') :
          t(`Stop selected, approximately ${stop.distance_meters} m from your location in a straight line. Your journey starts or ends at this stop; access walking time is not included.`,
            `Parada seleccionada, a unos ${stop.distance_meters} m en línea recta. El viaje empieza o termina en esta parada; no incluye el tiempo para llegar a pie.`);
        input.focus();win.dispatchEvent(new CustomEvent('ayo:planner-location-selected',{detail:{field:id,stop}}));
      }
      function show(stops) {
        candidates = stops; active = -1; list.replaceChildren();
        for (const [index, stop] of stops.entries()) {
          const li = add('li', '', list); li.setAttribute('role', 'presentation');
          const option = add('button', stop.name, li); option.type = 'button'; option.id = `${id}-option-${index}`;
          option.tabIndex = -1; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
          add('small', `${t('Stop','Parada')} ${stop.stop_id}`, option);
          if (stop.description) add('small', stop.description, option);
          for(const service of stop.scheduled_directions || [])add('small',`${t('Route','Ruta')} ${service.route_number} → ${service.headsign}`,option);
          if (stop.distance_meters != null) add('small', t(`≈ ${stop.distance_meters} m straight-line distance`, `≈ ${stop.distance_meters} m en línea recta`), option);
          option.addEventListener('pointerdown', e => e.preventDefault());
          option.addEventListener('click', () => select(stop));
        }
        list.hidden = !stops.length; input.setAttribute('aria-expanded', String(!!stops.length));
      }
      async function search(url, token, nearby) {
        controller = new AbortController();
        try {
          const data = await get(url, controller.signal);
          if (token !== serial) return;
          if (!Array.isArray(data.locations) || data.locations.some(s =>
            typeof s.stop_id !== 'string' || typeof s.name !== 'string')) {
            const error = Error('Invalid stop-search response'); error.code = 'invalid_response'; throw error;
          }
          show(data.locations);
          info.textContent = data.locations.length ? t('Choose a stop below. Use arrow keys and Enter.', 'Elige una parada. Usa las flechas y Enter.') :
            nearby ? t('No MCTS stops found within 1.5 km. Search by stop name instead.', 'No hay paradas MCTS en 1,5 km. Busca por nombre.') :
              t('No matching stop names. Try a street or intersection, or use the official planner for addresses.', 'No hay paradas con ese nombre. Prueba una calle o cruce, o usa el planificador oficial para direcciones.');
          if(nearby&&Number.isFinite(locationAccuracy)&&locationAccuracy>200)info.textContent+=' '+t(`Location accuracy is about ${Math.round(locationAccuracy)} m. Confirm the stop manually; proximity may be inaccurate.`,`La precisión de ubicación es de unos ${Math.round(locationAccuracy)} m. Confirma la parada; la cercanía puede ser imprecisa.`);
        } catch (error) {
          if (token !== serial || error.name === 'AbortError') return;
          close(); info.textContent = searchFailure(error, es, win.location.hostname);
          win.console.warn('AYO stop search failed', {status: error.status || null, code: error.code || error.name});
        }
      }
      input.addEventListener('input', () => {
        cancel(); chosen = null; close(); invalidate();win.dispatchEvent(new CustomEvent('ayo:planner-location-selected',{detail:{field:id,stop:null}}));
        if (input.value.trim().length < 2) { info.textContent = t('Type at least two letters.', 'Escribe al menos dos letras.'); return; }
        info.textContent = t('Searching stops…', 'Buscando paradas…'); const token = serial;
        timer = setTimeout(() => search('/api/journey-locations?q=' + encodeURIComponent(input.value.trim()), token, false), 250);
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
          document.getElementById(`${id}-option-${active}`).scrollIntoView({block: 'nearest'});
        } else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); select(candidates[active]); }
      });
      // Keep the list's layout stable between pointerdown and click. Hiding it
      // on blur can move the location/submit button away from the pointer.
      input.addEventListener('blur', cancel);
      document.addEventListener('click', event => {
        if (!box.contains(event.target)) { cancel(); close(); }
      });
      locate.addEventListener('click', () => {
        cancel(); chosen = null; input.value = ''; close(); invalidate();
        if (!win.navigator.geolocation) { info.textContent = t('Location is unavailable in this browser. Search by stop name.', 'La ubicación no está disponible. Busca por nombre.'); return; }
        const token = serial; locate.disabled = true;locationAccuracy=null;
        info.textContent = t('Finding your location…', 'Buscando tu ubicación…');
        win.navigator.geolocation.getCurrentPosition(position => {
          locate.disabled = false; if (token !== serial) return;
          locationAccuracy=position.coords.accuracy;
          info.textContent = t('Finding nearby stops…', 'Buscando paradas cercanas…');
          search(`/api/journey-locations?lat=${encodeURIComponent(position.coords.latitude)}&lon=${encodeURIComponent(position.coords.longitude)}`, token, true);
        }, () => {
          locate.disabled = false; if (token !== serial) return;
          info.textContent = t('Could not access your location. Allow location access or search by stop name.', 'No se pudo acceder a tu ubicación. Permite el acceso o busca por nombre.');
        }, {enableHighAccuracy: false, timeout: 10000, maximumAge: 60000});
      });
      return {input, selected: () => chosen, select};
    }
    const from = locationField('planFrom', 'From', 'Origen');
    const to = locationField('planTo', 'To', 'Destino');
    const swap=add('button',t('Swap From and To','Intercambiar origen y destino'),form,'favorite-chip');swap.type='button';swap.onclick=()=>{const a=from.selected(),b=to.selected();if(!a||!b){status.textContent=t('Choose both stops before swapping.','Elige ambas paradas antes de intercambiar.');return;}from.select(b);to.select(a);};
    win.addEventListener('ayo:planner-context',e=>{if(e.detail.from&&from.selected()?.stop_id!==e.detail.from.stop_id)from.select(e.detail.from);if(e.detail.to&&to.selected()?.stop_id!==e.detail.to.stop_id)to.select(e.detail.to);if(e.detail.freshSearch){invalidate();form.requestSubmit();}});
    function drawMap(data) {
      if(mapSuppressed)return false;
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
      results.replaceChildren();
      if(data.nearby_trip){
        add('p',t(`These stops are about ${data.straight_line_distance_meters} m apart in a straight line. Check the boarding direction: nearby platforms may serve different directions. Large out-and-back detours are excluded. Walking requires opt-in and an actual path check.`,
          `Estas paradas están a unos ${data.straight_line_distance_meters} m en línea recta. Comprueba el sentido: las plataformas cercanas pueden servir sentidos distintos. Se excluyen grandes rodeos de ida y vuelta. Caminar requiere tu elección y comprobar el camino real.`),results,'journey-warning');
      }
      for(const [stops,field,origin] of [[data.nearby_origin_stops,from,true],[data.nearby_destination_stops,to,false]]){
        for(const stop of stops || []){
          const label=origin?t('Choose nearby origin','Elegir origen cercano'):t('Choose nearby destination','Elegir destino cercano');
          const button=add('button',`${label}: ${stop.name} · ${t('Stop','Parada')} ${stop.stop_id} · ≈ ${stop.distance_meters} m ${t('from selected stop','de la parada elegida')}`,results,'favorite-chip');button.type='button';
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
      if(firstBus){const alert=add('button',t('Set Departure Alert','Crear aviso de salida'),results,'favorite-chip');alert.type='button';alert.onclick=()=>{const bus=data.legs.find(l=>l.type==='bus');return win.AyoWorkspaces.open('alerts',{stop:bus?.from_stop||data.origin,departure:bus?{trip_id:bus.trip_id,service_date:bus.service_date,route_id:bus.route}:null});};}
      if(data.choices_available>1){const other=add('button',t('Other journey option','Otra opción de viaje'),results,'favorite-chip');other.type='button';other.onclick=()=>{choice=(data.selected_choice+1)%data.choices_available;form.requestSubmit();};}
      add('h3', `${data.origin.name} → ${data.destination.name}`, results);
      const walkingOnly = data.legs.every(leg=>leg.type==='walk');
      const transfers = walkingOnly ? t('Estimated walk only', 'Solo caminata estimada') : data.transfers ? `${data.transfers} ${data.transfers === 1 ? t('transfer', 'transbordo') : t('transfers', 'transbordos')}` : t('Direct journey', 'Viaje directo');
      add('p', `${duration(data.duration_seconds)} · ${transfers}${data.walking_estimated ? t(' · includes estimated walking time', ' · incluye caminata estimada') : ''}`, results, 'journey-summary');
      add('p', `${walkingOnly?t('Estimated start','Inicio estimado'):t('Scheduled departure', 'Salida programada')}: ${timeLabel(data.departure, es)} · ${walkingOnly?t('Estimated arrival','Llegada estimada'):t('Arrival', 'Llegada')}: ${timeLabel(data.arrival, es)}`, results);
      if(walkingOnly)add('p',t('This is an estimated connection between the selected stops, not a verified pedestrian route or scheduled bus service.','Esta conexión entre las paradas es estimada; no es una ruta peatonal verificada ni servicio de autobús programado.'),results,'tiny-note');
      else add('p', t(`${data.requested_departure_at?'From requested time':'At search time'}: about ${duration(data.initial_wait_seconds)} until departure from the selected origin stop. Travel duration includes transfers; getting to the first stop is not included.`,
        `${data.requested_departure_at?'Desde la hora solicitada':'Al buscar'}: unos ${duration(data.initial_wait_seconds)} hasta la salida desde la parada elegida. La duración incluye transbordos; no incluye llegar a la primera parada.`), results, 'tiny-note');
      const steps = add('ol', '', results, 'journey-steps'); let rides = 0;
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
          const track=add('button',t(`Track Route ${leg.route_number}`,`Seguir ruta ${leg.route_number}`),li,'favorite-chip');track.type='button';track.onclick=()=>win.AyoWorkspaces.open('tracking',{route:leg.route});
          add('h4', t(`Take Route ${leg.route_number} toward ${leg.headsign || leg.to_stop.name}`,
            `Toma la ruta ${leg.route_number} hacia ${leg.headsign || leg.to_stop.name}`), li);
          add('p', `${t('Board at', 'Sube en')} ${leg.from_stop.name} · ${timeLabel(leg.departure, es)}`, li);
          add('p', `${t('Get off at', 'Baja en')} ${leg.to_stop.name} · ${timeLabel(leg.arrival, es)} · ${duration(leg.duration_seconds)}`, li);
          if (!leg.geometry.length) add('p', t('GTFS shape unavailable for this trip.', 'No hay trazado GTFS para este viaje.'), li, 'tiny-note');
        } else {
          add('h4', t(`Walking connection: ${leg.from_stop.name} → ${leg.to_stop.name}`,
            `Conexión a pie: ${leg.from_stop.name} → ${leg.to_stop.name}`), li);
          add('p', t(`Approximately ${leg.meters} m straight-line distance · ${duration(leg.duration_seconds)} estimated. No walking path or accessibility has been verified.`,
            `Unos ${leg.meters} m en línea recta · ${duration(leg.duration_seconds)} estimados. No se verifica la ruta ni la accesibilidad.`), li);
          add('p', `${t('Estimated connection time', 'Horario estimado de conexión')}: ${timeLabel(leg.departure, es)} → ${timeLabel(leg.arrival, es)}`, li);
          const link = add('a', t('Check walking directions with an external map', 'Consulta indicaciones a pie en un mapa externo'), li);
          link.href = walkingLink(leg); link.target = '_blank'; link.rel = 'noopener noreferrer';
        }
      }
      const mapStatus = add('p', t('Map: official GTFS shape points are limited to the ride when source distances allow; otherwise the full trip is shown. Markers show endpoints. Walking paths are not drawn.',
        'Mapa: los puntos GTFS se limitan al tramo si las distancias de origen lo permiten; si no, se muestra el viaje completo. Los marcadores indican los extremos. No se dibujan rutas peatonales.'), results, 'tiny-note');
      const view = add('button', t('Show journey on live map', 'Ver viaje en el mapa'), results, 'favorite-chip'); view.type = 'button';
      view.addEventListener('click', () => {
        mapSuppressed=false;
        if (drawMap(data)) document.getElementById('map').scrollIntoView({block: 'center', behavior: win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        else mapStatus.textContent = t('The map is unavailable. Your scheduled journey instructions are still shown above.', 'El mapa no está disponible. Las instrucciones programadas siguen arriba.');
      });
      if (!mapSuppressed&&!drawMap(data)) mapStatus.textContent = t('The map is unavailable. Follow the scheduled instructions above; retry the map when connected.', 'El mapa no está disponible. Consulta las instrucciones y vuelve a intentarlo con conexión.');
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const a = from.selected(), b = to.selected();
      if (!a || !b) { status.textContent = t('Choose both locations from the suggestions before searching.', 'Elige ambos lugares de las sugerencias antes de buscar.'); (!a ? from : to).input.focus(); return; }
      if (a.stop_id === b.stop_id) { status.textContent = t('Choose different origin and destination stops.', 'Elige paradas distintas de origen y destino.'); return; }
      if(!win.AyoWorkspaces?.activeFeature||win.AyoWorkspaces.activeFeature==='planner')mapSuppressed=false;
      invalidate(false); const token = version; request = new AbortController(); submit.disabled = true;
      status.textContent = t('Finding scheduled connections…', 'Buscando conexiones programadas…'); results.setAttribute('aria-busy', 'true');
      try {
        const departure=mode.value==='depart'?chicagoDeparture(when.value):'';
        const data = await get(`/api/journeys?from=${encodeURIComponent(a.stop_id)}&to=${encodeURIComponent(b.stop_id)}&walking=${walking.checked?'1':'0'}&choice=${choice}${departure?'&depart_at='+encodeURIComponent(departure):''}`, request.signal);
        if (token !== version) return;
        itinerary = data; render(itinerary); updateExpiry(); status.textContent = data.legs.length ? (data.legs.every(l=>l.type==='walk')?t('Estimated walking connection only. Check the actual path before traveling.','Solo conexión a pie estimada. Comprueba el camino real antes de viajar.'):t('Scheduled journey found. Check service alerts before traveling.', 'Viaje programado encontrado. Consulta los avisos antes de viajar.')) : t('No journey found within the search limits.', 'No se encontró un viaje dentro de los límites.');
      } catch (error) {
        if (token !== version || error.name === 'AbortError') return;
        status.textContent = t('Journey search is unavailable or exceeded its limits. Try again, choose another stop, or use the official planner.', 'La búsqueda no está disponible o superó sus límites. Inténtalo de nuevo, elige otra parada o usa el planificador oficial.');
      } finally {
        if (token === version) { submit.disabled = false; results.removeAttribute('aria-busy'); request = null; }
      }
    });
  }
  const exported = {mount, timeLabel, duration, walkingLink, searchFailure, itineraryExpired,chicagoDeparture};
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (root.document) root.document.addEventListener('DOMContentLoaded', () => mount(root.document, root));
})(typeof window !== 'undefined' ? window : globalThis);
