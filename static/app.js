
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
  mode: "idle",
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
  } catch {
    console.warn("Browser storage unavailable.");
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
  }).setView(CENTER, 11);

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(state.map);

  state.markers = L.layerGroup().addTo(state.map);
}

/* ==========================================================
   04. BUS ICONS
   ========================================================== */

function createBusIcon(stale = false) {
  const opacity = stale ? "0.45" : "1";

  return L.divIcon({
    className: "",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
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
      : `${bus.speed_kmh} km/h`
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

  if (age === null) {
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
    const stale = age === null || age > 120;

    nextKeys.add(key);
    points.push(position);

    if (state.markerIndex.has(key)) {
      const marker = state.markerIndex.get(key);

      marker.setLatLng(position);
      marker.setIcon(createBusIcon(stale));

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

      marker.bindPopup(createPopup(bus));
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

  $("connectionBadge").textContent = "● CONNECTING";

  try {
    const url = state.mode === "route"
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
    if (data.feed_fresh === false) buses = buses.map(b => ({...b, reported_at: null}));

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

    state.lastBuses = buses;
    state.lastSuccessfulUpdate = new Date();

    showBuses(buses, zoom);

    $("busCount").textContent =
      `${buses.length} buses`;

    $("refreshTime").textContent =
      "LAST REQUEST: " +
      state.lastSuccessfulUpdate.toLocaleTimeString(
        state.language === "es" ? "es-US" : "en-US",
        {timeZone: "America/Chicago"}
      );

    $("trackingState").textContent =
      "● AUTO TRACKING ACTIVE";

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
        ? "VEHICLE AGE: UNKNOWN"
        : `OLDEST KNOWN REPORT: ${Math.floor(oldest / 60)} MIN`;

    if (staleCount > 0) {
      $("connectionBadge").textContent =
        "● SOME DATA STALE";

      setStatus(
        `${staleCount} vehicle positions are old or have unknown timestamps. Use caution.`,
        true
      );
    } else if (state.mode === "nearby") {
      $("connectionBadge").textContent =
        "● RECENT REPORTS";

      setStatus(
        `${buses.length} reported buses within 3 km. Use Rider tools for stops and verified arrival data.`
      );
    } else {
      $("connectionBadge").textContent =
        buses.length ? "● RECENT REPORTS" : "● FEED REACHED";

      setStatus(
        buses.length
          ? `${buses.length} reported buses on Route ${state.route}.`
          : `No reported buses found for Route ${state.route}.`
      );
    }

  } catch (error) {
    if (
      error.name !== "AbortError" &&
      version === state.version
    ) {
      $("connectionBadge").textContent =
        "● CONNECTION LOST";

      $("trackingState").textContent =
        "● DATA NOT CURRENT";

      setStatus(
        "Unable to refresh MCTS information. Existing markers may be outdated.",
        true
      );

      // Remove markers rather than leave failed updates looking live.
      showBuses([], false);

      $("busCount").textContent = "—";
      $("dataFreshness").textContent =
        "VEHICLE AGE: UNAVAILABLE";

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

function searchRoute(value) {
  const route = String(value).trim().toUpperCase();

  if (!route) {
    setStatus("Enter a bus route, such as 19 or BLU.", true);
    return;
  }

  stopTracking();

  state.route = route;
  state.mode = "route";
  state.position = null;

  $("routeInput").value = route;

  setStatus(`Searching Route ${route}...`);

  renderFavorites();
  cycle(true);
}

/* ==========================================================
   09. FAVORITE ROUTES
   ========================================================== */

function renderFavorites() {
  const holder = $("favorites");

  holder.replaceChildren();

  for (const route of state.favorites) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "favorite-chip";
    button.textContent = `★ ${route}`;

    button.addEventListener(
      "click",
      () => searchRoute(route)
    );

    holder.append(button);
  }

  $("favoriteButton").textContent =
    state.route && state.favorites.includes(state.route)
      ? "★ Remove saved route"
      : "☆ Save this route";
}

function toggleFavorite() {
  if (!state.route) {
    setStatus("Select a bus route before saving it.", true);
    return;
  }

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

  safelySave("ayo-favorites", state.favorites);
  renderFavorites();
}

/* ==========================================================
   10. NEARBY BUSES
   ========================================================== */

function nearMe() {
  if (!navigator.geolocation) {
    setStatus("Location is not supported by your browser.", true);
    return;
  }

  setStatus("Requesting location permission...");

  navigator.geolocation.getCurrentPosition(
    position => {
      stopTracking();

      state.route = "";
      state.mode = "nearby";

      state.position = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      $("routeInput").value = "";

      renderFavorites();
      cycle(true);

      document.getElementById("main")?.scrollIntoView({
        behavior: "smooth"
      });
    },

    () => setStatus(
      "Location unavailable or permission denied. Route search still works.",
      true
    ),

    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 30000
    }
  );
}

/* ==========================================================
   11. ENGLISH AND SPANISH
   ========================================================== */

const translations = {
  en: {
    navHome: "Home",
    navMap: "Live Tracking",
    navFeatures: "Features",
    navAbout: "Creator",

    eyebrow: "MILWAUKEE // TRANSIT INTELLIGENCE",
    heroTitle:
      '<span class="hero-ayo">AYO!</span>' +
      '<span class="hero-question">Where\'s My Bus?</span>',

    heroSubtitle:
      "The city never waits. Know your route before you step outside.",

    findRide: "TRACK MY BUS ↗",
    builtFor: "BUILT FOR THE STREETS OF MILWAUKEE",

    mapHeading: 'Find your <em>ride.</em>',
    routeLookup: "BUS ROUTE LOOKUP",
    routeHelp: "Search a route such as 19, 21, BLU, or PUR.",

    search: "SEARCH ROUTE ↗",
    nearby: "⌖ NEAR ME",

    mapTitle: "MILWAUKEE LIVE MAP",

    featureHeading: 'More than <em>a map.</em>',

    disclaimer:
      "Independent transit project. Bus positions reflect the latest reported MCTS information and are not guaranteed arrivals."
  },

  es: {
    navHome: "Inicio",
    navMap: "Seguimiento en vivo",
    navFeatures: "Funciones",
    navAbout: "Creador",

    eyebrow: "MILWAUKEE // INFORMACIÓN DE TRÁNSITO",

    heroTitle:
      '<span class="hero-ayo">AYO!</span>' +
      '<span class="hero-question">¿Dónde está mi autobús?</span>',

    heroSubtitle:
      "La ciudad nunca espera. Consulta tu ruta antes de salir.",

    findRide: "BUSCAR MI AUTOBÚS ↗",
    builtFor: "CREADO PARA LAS CALLES DE MILWAUKEE",

    mapHeading: 'Encuentra tu <em>autobús.</em>',
    routeLookup: "BUSCAR RUTA",
    routeHelp: "Busca una ruta como 19, 21, BLU o PUR.",

    search: "BUSCAR RUTA ↗",
    nearby: "⌖ CERCA DE MÍ",

    mapTitle: "MAPA EN VIVO DE MILWAUKEE",

    featureHeading: 'Más que <em>un mapa.</em>',

    disclaimer:
      "Proyecto independiente. Las posiciones muestran los últimos datos reportados por MCTS y no garantizan horarios de llegada."
  }
};

function translate() {
  const dictionary = translations[state.language];

  document.documentElement.lang = state.language;

  document.querySelectorAll("[data-i18n]").forEach(
    element => {
      const key = element.dataset.i18n;

      if (dictionary[key] !== undefined) {
        element.textContent = dictionary[key];
      }
    }
  );

  document.querySelectorAll("[data-i18n-html]").forEach(
    element => {
      const key = element.dataset.i18nHtml;

      if (dictionary[key] !== undefined) {
        // Trusted translation templates defined above.
        element.innerHTML = dictionary[key];
      }
    }
  );

  $("languageButton").textContent =
    state.language === "en" ? "ES" : "EN";
}

/* ==========================================================
   12. MILWAUKEE CLOCK
   ========================================================== */

function updateClock() {
  $("clock").textContent =
    new Intl.DateTimeFormat(state.language === "es" ? "es-US" : "en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(new Date());
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
  updateClock();
  initializeMap();

  setInterval(updateClock, 30000);

  $("routeForm").addEventListener("submit", event => {
    event.preventDefault();
    searchRoute($("routeInput").value);
  });

  $("nearbyButton").addEventListener("click", nearMe);

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

      safelySave("ayo-language", state.language);
      translate();
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
    if (document.hidden) {
      stopTracking();

      $("trackingState").textContent =
        "● PAUSED — TAB HIDDEN";

    } else if (state.mode !== "idle") {
      cycle(false);
    }
  });

  window.addEventListener("offline", () => {
    stopTracking();
    showBuses([], false);
    $("connectionBadge").textContent = "● OFFLINE";
    $("trackingState").textContent = "● LIVE DATA UNAVAILABLE";
    $("dataFreshness").textContent = "VEHICLE AGE: UNAVAILABLE";
  });

  window.addEventListener("online", () => {
    if (state.mode !== "idle" && !document.hidden) {
      stopTracking();
      cycle(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", start);
