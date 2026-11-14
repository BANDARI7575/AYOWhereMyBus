
"use strict";

/* ==========================================================
   AYO! WHERE'S MY BUS?
   LIVE MCTS TRACKING — JAVASCRIPT
   ========================================================== */

const $ = (id) => document.getElementById(id);

const API = "/api/buses";
const REFRESH_MS = 15000;
const CENTER = [43.0389, -87.9065];

const state = {
  route: "",
  mode: "all",
  position: null,
  request: null,
  timer: null,
  version: 0,
  language: "en",
  map: null,
  markers: null,
  markerIndex: new Map(),
  favorites: [],
  lastSuccessfulUpdate: null,
  lastBuses: []
};
window.state = state;

/* ==========================================================
   01. LOCAL STORAGE
   ========================================================== */

function safelyLoad(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function safelySave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    console.warn("Browser storage unavailable.");
    return false;
  }
}

/* ==========================================================
   02. HELPERS
   ========================================================== */

function setStatus(message, warning = false) {
  const element = $("message");

  if (!element) return;

  element.textContent = message;
  element.style.color = warning
    ? "var(--danger)"
    : "var(--muted)";
}

function formatTime(seconds) {
  if (
    seconds === null ||
    seconds === undefined ||
    !Number.isFinite(Number(seconds))
  ) {
    return "Unknown";
  }

  return new Date(Number(seconds) * 1000)
    .toLocaleTimeString(state.language === "es" ? "es-US" : "en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit"
    });
}

function reportAgeSeconds(timestamp) {
  if (
    timestamp === null ||
    timestamp === undefined ||
    !Number.isFinite(Number(timestamp)) ||
    Number(timestamp) <= 0
  ) {
    return null;
  }

  if (Number(timestamp) * 1000 > Date.now() + 60000) return null;
  return Math.max(
    0,
    Math.floor(Date.now() / 1000 - Number(timestamp))
  );
}

function ageLabel(timestamp) {
  const age = reportAgeSeconds(timestamp);

  if (age === null) return "Unknown";

  if (age < 60) return `${age} seconds ago`;

  return `${Math.floor(age / 60)} minutes ago`;
}

function compassDirection(degrees) {
  if (
    degrees === null ||
    degrees === undefined ||
    !Number.isFinite(Number(degrees))
  ) {
    return "Unknown";
  }

  const directions = [
    "North", "Northeast", "East", "Southeast",
    "South", "Southwest", "West", "Northwest"
  ];

  const angle = ((Number(degrees) % 360) + 360) % 360;
  const index = Math.round(angle / 45) % 8;

  return `${directions[index]} (${Math.round(angle)}°)`;
}

function distanceKm(a, b) {
  const toRad = (v) => v * Math.PI / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
    Math.cos(toRad(b.latitude)) *
    Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(
    Math.sqrt(h),
    Math.sqrt(Math.max(0, 1 - h))
  );
}

/* ==========================================================
   03. MILWAUKEE MAP
   ========================================================== */

function initializeMap() {
  if (!window.L) {
    setStatus(
      "The map library could not load. Check your connection.",
      true
    );
    return;
  }

  state.map = L.map("map", {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView(CENTER, 12);

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }
  ).addTo(state.map);

  state.markers = L.layerGroup().addTo(state.map);
}

// Leaflet caches a zero-size viewport when its screen is hidden. Preserve the
// geographic center explicitly when the real viewport becomes measurable.
function resizeTransitMap() {
  if (!state.map) return;
  const center = state.map.getCenter(), zoom = state.map.getZoom();
  state.map.invalidateSize({pan:false});
  state.map.setView(center, zoom, {animate:false});
}

/* ==========================================================
   04. BUS ICONS
   ========================================================== */

function createBusIcon(stale = false) {
  const opacity = stale ? "0.45" : "1";

  return L.divIcon({
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -23],
    html: `
      <div class="bus-icon" style="opacity:${opacity}">
        <svg viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             stroke-width="1.8"
             stroke-linecap="round"
             stroke-linejoin="round"
             aria-hidden="true">
          <rect x="5" y="3"
                width="14" height="17" rx="3"/>
          <path d="M5 12h14M8 20v2M16 20v2
                   M8 7h8M8 16h.01M16 16h.01"/>
        </svg>
      </div>
    `
  });
}

/* ==========================================================
   05. BUS INFORMATION POPUP
   ========================================================== */

function popupRow(parent, label, value) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const left = document.createElement("span");
  left.textContent = label;

  const right = document.createElement("strong");
  right.textContent = String(value);

  row.append(left, right);
  parent.append(row);
}

function createPopup(bus) {
  const root = document.createElement("div");

  const heading = document.createElement("h4");
  heading.className = "popup-title";
  heading.textContent = `AYO! · Route ${bus.route}`;

  root.append(heading);

  popupRow(root, "Bus ID", bus.bus_id || "Unknown");
  popupRow(root, "Route", bus.route || "Unknown");

  popupRow(
    root,
    "Speed",
    bus.speed_kmh == null
      ? "Not reported"
      : window.AyoUnits.speed(bus.speed_kmh, state.language)
  );

  popupRow(
    root,
    "Heading",
    compassDirection(bus.direction_degrees)
  );

  popupRow(
    root,
    "Last GPS report",
    formatTime(bus.reported_at)
  );

  popupRow(
    root,
    "Report age",
    ageLabel(bus.reported_at)
  );

  const note = document.createElement("p");
  note.className = "popup-note";

  const age = reportAgeSeconds(bus.reported_at);

  if (state.feedFresh === false) {
    note.textContent = "Vehicle feed is outdated. This is a last known position.";
  } else if (age === null) {
    note.textContent =
      "GPS report time unavailable. Location freshness cannot be verified.";
  } else if (age > 120) {
    note.textContent =
      "Warning: This vehicle position may be outdated.";
  } else {
    note.textContent =
      "Last reported GPS position. Not a guaranteed arrival.";
  }

  root.append(note);

  return root;
}

/* ==========================================================
   06. DISPLAY AND UPDATE VEHICLE MARKERS
   ========================================================== */

function showBuses(buses, zoom = false) {
  if (!state.map || !state.markers) return;

  const nextKeys = new Set();
  const points = [];

  for (const bus of buses) {
    const lat = Number(bus.latitude);
    const lon = Number(bus.longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180
    ) {
      continue;
    }

    const key = `${bus.bus_id}:${bus.route}`;
    const position = [lat, lon];
    const age = reportAgeSeconds(bus.reported_at);
    const stale = state.feedFresh === false || age === null || age > 120;

    nextKeys.add(key);
    points.push(position);

    if (state.markerIndex.has(key)) {
      const marker = state.markerIndex.get(key);

      marker._ayoBusData=bus;marker.setLatLng(position);
      if(marker._ayoStale!==stale){marker.setIcon(createBusIcon(stale));marker._ayoStale=stale;}

      // Preserve the popup while refreshing its data.
      if (marker.isPopupOpen()) {
        marker.setPopupContent(createPopup(bus));
      } else {
        marker.bindPopup(createPopup(bus));
      }

    } else {
      const marker = L.marker(position, {
        icon: createBusIcon(stale),
        title: `Bus ${bus.bus_id}, Route ${bus.route}`
      });

      marker._ayoBusData=bus;marker._ayoStale=stale;marker.bindPopup(createPopup(bus));
      marker.addTo(state.markers);

      state.markerIndex.set(key, marker);
    }
  }

  // Remove vehicles no longer included in the result.
  for (const [key, marker] of state.markerIndex) {
    if (!nextKeys.has(key)) {
      state.markers.removeLayer(marker);
      state.markerIndex.delete(key);
    }
  }

  regroupVehicles();
  if (zoom && points.length > 0) {
    state.map.fitBounds(points, {
      padding: [45, 45],
      maxZoom: 14
    });
  }
}

/* ==========================================================
   07. LIVE MCTS API
   ========================================================== */

async function refresh(zoom = false) {
  if (
    document.hidden ||
    state.mode === "idle" ||
    state.request
  ) {
    return;
  }

  const controller = new AbortController();
  const version = state.version;

  state.request = controller;

  $("connectionBadge").textContent = "Checking positions";

  try {
    const url = (state.mode === "route" || state.mode === "journey" && state.route)
      ? `${API}?route=${encodeURIComponent(state.route)}`
      : API;

    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();

    if (
      controller.signal.aborted ||
      version !== state.version
    ) {
      return;
    }

    if (!Array.isArray(data.buses)) {
      throw new Error("Invalid transit data received.");
    }

    let buses = data.buses;
    state.feedFresh = data.feed_fresh === true;

    if (
      state.mode === "nearby" &&
      state.position
    ) {
      buses = buses
        .map(bus => ({
          ...bus,
          distance: distanceKm(state.position, bus)
        }))
        .filter(bus => bus.distance <= 3)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 30);
    }

    if(state.mode==="journey")buses=buses.filter(b=>(state.journeyLegs||[]).some(l=>String(l.route)===String(b.route)&&(b.direction_id==null||l.direction_id==null||String(l.direction_id)===String(b.direction_id))));
    state.lastBuses = buses;
    state.lastSuccessfulUpdate = new Date();

    showBuses(buses, zoom);

    $("busCount").textContent =
      `${buses.length} buses`;

    $("refreshTime").textContent =
      "Checked at " +
      state.lastSuccessfulUpdate.toLocaleTimeString(
        state.language === "es" ? "es-US" : "en-US",
        {timeZone: "America/Chicago"}
      );

    $("trackingState").textContent =
      "Automatic updates every 15 seconds";

    const ages = buses.map(
      bus => reportAgeSeconds(bus.reported_at)
    );

    const knownAges = ages.filter(age => age !== null);
    const staleCount = ages.filter(
      age => age === null || age > 120
    ).length;

    const oldest = knownAges.length
      ? Math.max(...knownAges)
      : null;

    $("dataFreshness").textContent =
      oldest === null
        ? "Vehicle report time unknown"
        : `Oldest vehicle report: ${Math.floor(oldest / 60)} minutes ago`;

    if (data.feed_fresh !== true || staleCount > 0) {
      $("connectionBadge").textContent =
        "Some positions are outdated";

      setStatus(
        data.feed_fresh !== true ? "MCTS vehicle feed is stale or unavailable. Positions are not current." : `${staleCount} vehicle positions are old or have unknown timestamps. Use caution.`,
        true
      );
    } else if (state.mode === "nearby") {
      $("connectionBadge").textContent =
        "Recent GPS reports";

      setStatus(
        `${buses.length} reported buses within ${window.AyoUnits.miles(3, state.language)}. Use Rider tools for stops and verified arrival data.`
      );
    } else {
      $("connectionBadge").textContent =
        buses.length ? "Recent GPS reports" : "Feed checked";

      setStatus(
        buses.length
          ? state.route ? `${buses.length} reported buses on Route ${state.route}.` : `${buses.length} reported buses across the network.`
          : state.route ? `No reported buses found for Route ${state.route}.` : "No reported buses returned. Check the official planner for service."
      );
    }

  } catch (error) {
    if (
      error.name !== "AbortError" &&
      version === state.version
    ) {
      state.feedFresh=false;
      showBuses(state.lastBuses,false);
      $("busCount").textContent=state.lastBuses.length ? state.lastBuses.length+(state.language==="es"?" últimas posiciones conocidas":" last known positions") : (state.language==="es"?"Posiciones no disponibles":"Positions unavailable");
      $("connectionBadge").textContent =
        "Connection unavailable";

      $("trackingState").textContent =
        "Positions not current";

      setStatus(
        "Unable to refresh MCTS information. Existing markers may be outdated.",
        true
      );

      // Remove markers rather than leave failed updates looking live.
      showBuses([], false);

      $("busCount").textContent = "—";
      $("dataFreshness").textContent =
        "Vehicle report time unavailable";

      console.error("MCTS request failed:", error);
    }
  } finally {
    if (state.request === controller) {
      state.request = null;
    }
  }
}

/* ==========================================================
   08. TRACKING CYCLE
   ========================================================== */

function stopTracking() {
  state.version++;

  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  if (state.request) {
    state.request.abort();
    state.request = null;
  }
}

async function cycle(zoom = false, version = state.version) {
  await refresh(zoom);

  if (
    version !== state.version ||
    state.mode === "idle" ||
    document.hidden
  ) {
    return;
  }

  state.timer = setTimeout(
    () => cycle(false, version),
    REFRESH_MS
  );
}

function searchRoute(value, {navigate = true} = {}) {
  const route = String(value).trim().toUpperCase();

  if (!route) {
    setStatus("Enter a bus route, such as 19 or BLU.", true);
    return;
  }

  stopTracking();

  state.journeyLegs=null;state.route = route;window.dispatchEvent(new CustomEvent('ayo:route-selected',{detail:{route}}));
  state.mode = "route";
  state.position = null;

  $("routeInput").value = route;

  setStatus(`Searching Route ${route}...`);

  renderFavorites();
  if (navigate) window.AyoSite?.navigate("map");
  cycle(true);
}

/* ==========================================================
   09. FAVORITE ROUTES
   ========================================================== */

function renderFavorites() {
  const holder = $("favorites");

  holder.replaceChildren();
  $("favoriteButton")?.setAttribute("aria-pressed",String(state.favorites.includes(state.route)));

  for (const route of state.favorites) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "favorite-chip";
    button.textContent = route;
    button.setAttribute("aria-label",(state.language === "es" ? "Ruta guardada " : "Saved route ") + route);

    button.addEventListener(
      "click",
      () => searchRoute(route)
    );

    holder.append(button);
  }

  $("favoriteButton").setAttribute("aria-label",state.favorites.includes(state.route)
    ? (state.language === "es" ? "Quitar ruta guardada" : "Remove saved route")
    : (state.language === "es" ? "Guardar esta ruta" : "Save this route"));
}

function toggleFavorite() {
  if (!state.route) {
    setStatus("Select a bus route before saving it.", true);
    return;
  }

  const previousFavorites=[...state.favorites];
  if (state.favorites.includes(state.route)) {
    state.favorites = state.favorites.filter(
      route => route !== state.route
    );
  } else {
    state.favorites = [
      ...state.favorites,
      state.route
    ].slice(-8);
  }

  if(!safelySave("ayo-favorites", state.favorites)){state.favorites=previousFavorites;setStatus("Browser storage unavailable. Favorite was not saved.",true);}
  renderFavorites();
  window.dispatchEvent(new CustomEvent("ayo:route-favorite-toggled",{detail:{route:state.route,saved:state.favorites.includes(state.route)}}));
}

/* ==========================================================
   10. NEARBY BUSES
   ========================================================== */

async function nearMe() {
 setStatus(state.language==='es'?'Solicitando ubicación…':'Requesting location permission…');
 try {const position=await AyoLocation.request({es:state.language==='es'});stopTracking();state.route='';state.mode='nearby';state.position={latitude:position.coords.latitude,longitude:position.coords.longitude};$('routeInput').value='';renderFavorites();window.AyoSite?.navigate('map');cycle(true);}catch(error){setStatus(error.message,true);}
}

/* ==========================================================
   11. ENGLISH AND SPANISH
   ========================================================== */

function translate() {
  document.documentElement.lang = state.language;
  $("languageButton").textContent = state.language === "en" ? "ES" : "EN";
}

/* ==========================================================
   12. MILWAUKEE CLOCK
   ========================================================== */

function updateClock() {
  const now = new Date();
  const locale = state.language === "es" ? "es-US" : "en-US";
  const options = {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit"
  };
  const clock = $("clock");
  if (clock) clock.textContent =
    new Intl.DateTimeFormat(locale, {
      ...options,
      timeZoneName: "short"
    }).format(now);
  const weatherClock = $("weatherClock");
  if (weatherClock) {
    weatherClock.textContent = new Intl.DateTimeFormat(locale, options).format(now);
  }
}

let clockTimer = null;

function synchronizeClock() {
  clearTimeout(clockTimer);
  updateClock();
  // Align the one pending update with the next wall-clock minute.
  // Recalculate after delayed callbacks instead of drifting from page-load time.
  clockTimer = setTimeout(synchronizeClock, 60000 - Date.now() % 60000);
}

/* ==========================================================
   13. INITIALIZE WEBSITE
   ========================================================== */

function start() {
  const favorites = safelyLoad("ayo-favorites", []);

  state.favorites = Array.isArray(favorites)
    ? favorites.filter(x => typeof x === "string")
    : [];

  state.language =
    safelyLoad("ayo-language", "en") === "es"
      ? "es"
      : "en";

  if (safelyLoad("ayo-day-mode", false)) {
    document.body.classList.add("day-mode");
  }

  translate();
  renderFavorites();
  if ($("clock") || $("weatherClock")) {
    synchronizeClock();
    window.addEventListener("focus", synchronizeClock);
    window.addEventListener("pageshow", synchronizeClock);
  }

  // A map failure must not stop the clock or prevent controls from binding.
  try {
    initializeMap();
  } catch (error) {
    console.warn("Map initialization failed.", error);
    setStatus("The map could not initialize. Please reload to try again.", true);
  }

  $("routeForm").addEventListener("submit", event => {
    event.preventDefault();
    searchRoute($("routeInput").value);
  });



  // Homepage shortcut uses the same nearby-bus function.
  $("heroNearbyButton")?.addEventListener(
    "click",
    event => {
      event.preventDefault();
      nearMe();
    }
  );

  $("favoriteButton").addEventListener(
    "click",
    toggleFavorite
  );

  $("languageButton").addEventListener(
    "click",
    () => {
      state.language =
        state.language === "en" ? "es" : "en";

      if(!safelySave("ayo-language", state.language)){state.language=state.language==="en"?"es":"en";setStatus("Browser storage unavailable. Language was not changed.",true);return;}
      window.dispatchEvent(new Event("ayo:language-change"));
      window.location.reload();
    }
  );

  $("themeButton").addEventListener("click", () => {
    document.body.classList.toggle("day-mode");

    safelySave(
      "ayo-day-mode",
      document.body.classList.contains("day-mode")
    );
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ($("clock") || $("weatherClock"))) synchronizeClock();

    if (document.hidden) {
      stopTracking();

      $("trackingState").textContent =
        "Updates paused while this tab is hidden";

    } else if (state.mode !== "idle") {
      $("trackingState").textContent = "Updating vehicle positions";
      stopTracking();
      cycle(false);
    }
  });

  window.addEventListener("offline", () => {
    stopTracking();
    showBuses([], false);
    $("connectionBadge").textContent = "Offline";
    $("trackingState").textContent = "Current positions unavailable";
    $("dataFreshness").textContent = "Vehicle report time unavailable";
  });

  window.addEventListener("online", () => {
    if (state.mode !== "idle" && !document.hidden) {
      stopTracking();
      cycle(false);
    }
  });
  if (navigator.onLine) cycle(false);
}

document.addEventListener("DOMContentLoaded", start);

// Planned route state replaces prior filters while retaining the exact itinerary overlay.
window.trackJourney=data=>{stopTracking();showBuses([],false);state.lastBuses=[];$('busCount').textContent=state.language==='es'?'Consultando vehículos':'Checking vehicles';state.journeyLegs=data.legs.filter(l=>l.type==='bus');const routes=[...new Set(state.journeyLegs.map(l=>l.route))];state.route=routes.length===1?routes[0]:'';state.mode=routes.length?'journey':'all';state.position=null;document.getElementById('routeInput').value=state.route;renderFavorites();dispatchEvent(new CustomEvent('ayo:route-selected',{detail:{route:state.route,journey:true}}));document.getElementById('mapRouteLabel').textContent=routes.length?(state.language==='es'?'Rutas del viaje: ':'Journey routes: ')+routes.join(', '):(state.language==='es'?'Todas las rutas':'All routes');cycle(false);};
const vehicleClusters=new Map();
function regroupVehicles(){
 if(!state.map||!state.markers)return;
 const groups=new Map(),cluster=state.map.getZoom()<=13&&state.markerIndex.size>40;
 for(const [key,marker]of state.markerIndex){const point=state.map.project(marker.getLatLng(),state.map.getZoom());const cell=cluster&&!marker.isPopupOpen()?'cell:'+Math.floor(point.x/56)+':'+Math.floor(point.y/56):'bus:'+key;const group=groups.get(cell)||[];group.push(marker);groups.set(cell,group);}
 const keep=new Set();
 for(const [cell,markers]of groups){
  if(markers.length===1){if(!state.markers.hasLayer(markers[0]))state.markers.addLayer(markers[0]);continue;}
  markers.forEach(m=>state.markers.removeLayer(m));keep.add(cell);const bounds=L.latLngBounds(markers.map(m=>m.getLatLng())),icon=L.divIcon({className:'bus-cluster',html:String(markers.length),iconSize:[44,44]});
  let node=vehicleClusters.get(cell);if(!node){node=L.marker(bounds.getCenter(),{icon,title:markers.length+' reported vehicles'}).addTo(state.markers);node.on('click',()=>{state.map.fitBounds(node._ayoBounds,{padding:[30,30],maxZoom:Math.min(18,state.map.getZoom()+2)});});vehicleClusters.set(cell,node);}else{node.setLatLng(bounds.getCenter());if(node._ayoCount!==markers.length)node.setIcon(icon);}node._ayoCount=markers.length;node._ayoBounds=bounds;if(!state.markers.hasLayer(node))state.markers.addLayer(node);
 }
 for(const [key,node]of vehicleClusters)if(!keep.has(key)){state.markers.removeLayer(node);vehicleClusters.delete(key);}
}
document.addEventListener('DOMContentLoaded',()=>{state.map?.on('zoomend',regroupVehicles);state.map?.on('popupopen',event=>{const marker=event.popup._source;if(marker?._ayoBusData)marker.setPopupContent(createPopup(marker._ayoBusData));});});
