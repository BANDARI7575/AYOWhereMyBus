
/* =============================================================
   AYOWhereMyBus / FRONTEND

   01  State + little helpers
   02  Map + honest GTFS data
   03  Route search, favorites, nearby vehicles
   04  Language, appearance, clock
   05  Connect everything

   No magic, just a lot of JavaScript and approximately 4 coffees.
   ============================================================= */

"use strict";

// 01 / STATE AND LITTLE HELPERS

const $ = (id) => document.getElementById(id);

const state = {
  route: "",
  mode: "idle",
  position: null,
  request: null,
  timer: null,
  language: "en",
  map: null,
  markers: null,
  zoomFirst: true,
  favorites: []
};

const API = "/api/buses";
const REFRESH_MS = 15000;
const CENTER = [43.0389, -87.9065];

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
    // Private browsing mode is fine.
  }
}

function status(message, warning = false) {
  $("message").textContent = message;
  $("message").style.color = warning
    ? "#e8aa81"
    : "var(--muted)";
}

function stamp(seconds) {
  if (!seconds || !Number.isFinite(Number(seconds))) {
    return "Unknown";
  }

  return new Date(Number(seconds) * 1000)
    .toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
}

function vehicleAge(seconds) {
  if (!seconds) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() / 1000 - seconds) / 60)
  );
}

// Convert a reported bearing into compass notation.
function bearing(degrees) {
  if (degrees === null || degrees === undefined) {
    return "Unknown";
  }

  const points = [
    "N", "NE", "E", "SE",
    "S", "SW", "W", "NW"
  ];

  const normalized =
    ((Number(degrees) % 360 + 360) % 360);

  const index = Math.round(normalized / 45) % 8;

  return `${points[index]} (${Math.round(degrees)}°)`;
}

// Distance between two GPS coordinates in kilometers.
function kmBetween(a, b) {
  const rad = (x) => x * Math.PI / 180;

  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
    Math.cos(rad(b.latitude)) *
    Math.sin(dLon / 2) ** 2;

  return 6371 * 2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* =============================================================
   02 / REAL MAP
   The yellow buses do NOT teleport: they use reported GPS.
   ============================================================= */

// Our custom yellow bus icon.
function busIcon() {
  return L.divIcon({
    className: "",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -23],

    html: `
      <div class="bus-icon">
        <svg viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             stroke-width="1.8"
             stroke-linejoin="round"
             stroke-linecap="round"
             aria-hidden="true">
          <rect x="5" y="3"
                width="14" height="17" rx="3"/>
          <path d="M5 12h14M8 20v2M16 20v2M8 7h8M8 16h.01M16 16h.01"/>
        </svg>
      </div>
    `
  });
}

const icon = busIcon();

function initializeMap() {
  if (!window.L) {
    status(
      "The map library did not load. Check your internet connection.",
      true
    );
    return;
  }

  state.map = L.map("map", {
    scrollWheelZoom: false
  }).setView(CENTER, 11);

  // Dark map tiles match our editorial theme.
  // Attribution stays visible because map creators deserve credit.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  ).addTo(state.map);

  state.markers = L.layerGroup().addTo(state.map);
}

// Make a safe popup using DOM elements instead of injecting feed HTML.
function popup(bus) {
  const root = document.createElement("div");

  const title = document.createElement("h4");
  title.className = "popup-title";
  title.textContent = "🚌 AYOWhereMyBus";

  root.append(title);

  const rows = [
    ["Bus ID", bus.bus_id || "Unknown"],
    ["Route", bus.route || "Unknown"],
    [
      "Speed",
      bus.speed_kmh == null
        ? "Not reported"
        : `${bus.speed_kmh} km/h`
    ],
    ["Heading", bearing(bus.direction_degrees)],
    ["Reported", stamp(bus.reported_at)]
  ];

  for (const [label, value] of rows) {
    const line = document.createElement("div");
    line.className = "popup-row";

    const left = document.createElement("span");
    left.textContent = label;

    const right = document.createElement("strong");
    right.textContent = String(value);

    line.append(left, right);
    root.append(line);
  }

  const note = document.createElement("p");
  note.className = "popup-note";
  note.textContent =
    "Last reported values. Not a predicted arrival.";

  root.append(note);

  return root;
}

function showBuses(buses, zoom) {
  if (!state.map || !state.markers) {
    return;
  }

  const points = [];

  // Remove outdated markers before displaying the new snapshot.
  state.markers.clearLayers();

  for (const bus of buses) {
    if (
      !Number.isFinite(bus.latitude) ||
      !Number.isFinite(bus.longitude)
    ) {
      continue;
    }

    const pos = [bus.latitude, bus.longitude];

    L.marker(pos, {
      icon,
      title: `Bus ${bus.bus_id}, route ${bus.route}`
    })
      .bindPopup(popup(bus))
      .addTo(state.markers);

    points.push(pos);
  }

  // Zoom when first searching, not every 15 seconds.
  if (zoom && points.length) {
    state.map.fitBounds(points, {
      padding: [45, 45],
      maxZoom: 14
    });
  }
}

/* =============================================================
   FETCH LIVE BUS DATA

   Every refresh asks Flask for information.
   Flask asks MCTS.
   MCTS gives us buses.
   Everyone has a job. Beautiful teamwork. 😎
   ============================================================= */

async function refresh(zoom = false) {
  if (
    document.hidden ||
    state.mode === "idle" ||
    state.request
  ) {
    return;
  }

  const controller = new AbortController();
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
      throw new Error(
        `Server returned ${response.status}`
      );
    }

    const data = await response.json();

    if (controller.signal.aborted) {
      return;
    }

    let buses = data.buses;

    // Nearby mode currently searches vehicles, NOT bus stops.
    if (
      state.mode === "nearby" &&
      state.position
    ) {
      buses = buses
        .map(b => ({
          ...b,
          distance: kmBetween(state.position, b)
        }))
        .filter(b => b.distance <= 3)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 30);
    }

    showBuses(buses, zoom);

    $("busCount").textContent =
      `${buses.length} buses`;

    $("connectionBadge").textContent =
      "● LIVE FEED REACHED";

    $("trackingState").textContent =
      "● AUTO TRACKING ACTIVE";

    $("refreshTime").textContent =
      `LAST REQUEST: ${new Date().toLocaleTimeString()}`;

    // Check age of actual vehicle reports, not just refresh time.
    const ages = buses
      .map(b => vehicleAge(b.reported_at))
      .filter(x => x !== null);

    const oldest = ages.length
      ? Math.max(...ages)
      : null;

    $("dataFreshness").textContent = oldest === null
      ? "VEHICLE AGE: UNKNOWN"
      : `OLDEST REPORT: ${oldest} MIN`;

    if (oldest !== null && oldest > 3) {
      $("connectionBadge").textContent =
        "● DATA MAY BE STALE";

      status(
        "Some vehicle reports are over 3 minutes old. Check an official source before relying on them.",
        true
      );

    } else if (state.mode === "nearby") {
      status(
        `${buses.length} reported buses within 3 km of your location. Stops and ETAs are coming later.`
      );

    } else {
      status(
        `${buses.length} reported vehicles for Route ${state.route}. Map refreshed; MCTS data may update more slowly.`
      );
    }

  } catch (error) {
    if (error.name !== "AbortError") {
      $("connectionBadge").textContent =
        "● CONNECTION LOST";

      $("trackingState").textContent =
        "● TRYING AGAIN";

      status(
        "Cannot refresh right now. Existing markers may be outdated.",
        true
      );

      console.error("Bus request failed:", error);
    }

  } finally {
    if (state.request === controller) {
      state.request = null;
    }
  }
}

/* =============================================================
   AUTOMATIC REFRESH

   setTimeout is used after a request finishes.
   This helps prevent requests from stacking up like
   buses at a red light. 🚌🚌🚌
   ============================================================= */

function stopTracking() {
  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = null;

  if (state.request) {
    state.request.abort();
    state.request = null;
  }
}

async function cycle(zoom = false) {
  await refresh(zoom);

  if (
    state.mode !== "idle" &&
    !document.hidden
  ) {
    state.timer = setTimeout(
      () => cycle(false),
      REFRESH_MS
    );
  }
}

function searchRoute(route) {
  const cleaned = route.trim().toUpperCase();

  if (!cleaned) {
    status(
      "Enter a route such as 19 or BLU.",
      true
    );
    return;
  }

  stopTracking();

  state.mode = "route";
  state.route = cleaned;
  state.position = null;

  $("routeInput").value = cleaned;

  status(`Searching Route ${cleaned}...`);

  cycle(true);
}

/* =============================================================
   03 / FAVORITES

   Save just route IDs locally.
   No login or secret account needed.
   ============================================================= */

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
    state.favorites.includes(state.route) && state.route
      ? "★ Remove saved route"
      : "☆ Save this route";
}

function toggleFavorite() {
  if (!state.route) {
    status(
      "Search a route first, then save it.",
      true
    );
    return;
  }

  state.favorites =
    state.favorites.includes(state.route)
      ? state.favorites.filter(x => x !== state.route)
      : [...state.favorites, state.route].slice(-8);

  safelySave(
    "ayo-favorites",
    state.favorites
  );

  renderFavorites();
}

/* =============================================================
   NEAR ME

   Request location only when the visitor clicks the button.
   Never grab someone's location secretly.
   ============================================================= */

function nearMe() {
  if (!navigator.geolocation) {
    status(
      "Your browser does not support location.",
      true
    );
    return;
  }

  status("Requesting location permission...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      stopTracking();

      state.mode = "nearby";
      state.route = "";

      state.position = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      $("routeInput").value = "";

      renderFavorites();
      cycle(true);
    },

    () => status(
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

/* =============================================================
   04 / LANGUAGES, APPEARANCE, CLOCK

   No extra Python libraries are needed for this part.
   ============================================================= */

const translations = {
  en: {
    navHome: "Home",
    navMap: "Live Map",
    navFeatures: "The Future",
    navAbout: "Creator",
    eyebrow: "MILWAUKEE // TRANSIT INTELLIGENCE",
    heroTitle: "THE CITY<br>NEVER <em>WAITS.</em>",
    heroSubtitle:
      "Know your route. Spend less time standing in the cold.",
    findRide: "FIND YOUR RIDE ↗",
    builtFor: "Built for the streets of Milwaukee.",
    mapHeading: "Find your <em>ride.</em>",
    routeLookup: "BUS ROUTE LOOKUP",
    routeHelp:
      "Enter a route like 19, 21, BLU, or PUR.",
    search: "SEARCH ROUTE ↗",
    nearby: "⌖ NEAR ME",
    mapTitle:
      'MILWAUKEE <span class="gold">LIVE MAP</span>',
    featureHeading: 'More than <em>a map.</em>',
    disclaimer:
      "Independent project. Map positions are last reported by MCTS, not guaranteed arrivals. Updates requested every 15 seconds while the tab is open."
  },

  es: {
    navHome: "Inicio",
    navMap: "Mapa en vivo",
    navFeatures: "Próximamente",
    navAbout: "Creador",
    eyebrow: "MILWAUKEE // INFORMACIÓN DE TRÁNSITO",
    heroTitle: "LA CIUDAD<br>NUNCA <em>ESPERA.</em>",
    heroSubtitle:
      "Conoce tu ruta. Pasa menos tiempo esperando en el frío.",
    findRide: "ENCUENTRA TU BUS ↗",
    builtFor: "Hecho para las calles de Milwaukee.",
    mapHeading: "Encuentra tu <em>bus.</em>",
    routeLookup: "BUSCAR RUTA",
    routeHelp:
      "Escribe una ruta como 19, 21, BLU o PUR.",
    search: "BUSCAR RUTA ↗",
    nearby: "⌖ CERCA DE MÍ",
    mapTitle:
      'MILWAUKEE <span class="gold">MAPA EN VIVO</span>',
    featureHeading: 'Más que <em>un mapa.</em>',
    disclaimer:
      "Proyecto independiente. El mapa muestra la última posición reportada por MCTS, no una hora de llegada garantizada. Se solicitan datos cada 15 segundos."
  }
};

function translate() {
  const dictionary = translations[state.language];

  document.documentElement.lang = state.language;

  document
    .querySelectorAll("[data-i18n]")
    .forEach(el => {
      el.textContent = dictionary[el.dataset.i18n];
    });

  // These translation strings are hardcoded here,
  // not taken from users or external API responses.
  document
    .querySelectorAll("[data-i18n-html]")
    .forEach(el => {
      el.innerHTML =
        dictionary[el.dataset.i18nHtml];
    });

  $("languageButton").textContent =
    state.language === "en" ? "ES" : "EN";
}

function updateClock() {
  $("clock").textContent =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(new Date());
}

/* =============================================================
   05 / CONNECT EVERYTHING

   Please don't forget this part.
   Past me did. 😭
   ============================================================= */

function start() {
  state.favorites = safelyLoad(
    "ayo-favorites",
    []
  );

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

  // Route search
  $("routeForm").addEventListener(
    "submit",
    event => {
      event.preventDefault();

      searchRoute(
        $("routeInput").value
      );

      renderFavorites();
    }
  );

  // Nearby buses
  $("nearbyButton").addEventListener(
    "click",
    nearMe
  );

  // Favorite routes
  $("favoriteButton").addEventListener(
    "click",
    toggleFavorite
  );

  // Language
  $("languageButton").addEventListener(
    "click",
    () => {
      state.language =
        state.language === "en" ? "es" : "en";

      safelySave(
        "ayo-language",
        state.language
      );

      translate();
    }
  );

  // Day/night appearance
  $("themeButton").addEventListener(
    "click",
    () => {
      document.body.classList.toggle(
        "day-mode"
      );

      safelySave(
        "ayo-day-mode",
        document.body.classList.contains("day-mode")
      );
    }
  );

  // Pause requests when the user switches tabs.
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        stopTracking();

        $("trackingState").textContent =
          "● PAUSED — TAB HIDDEN";

      } else if (state.mode !== "idle") {
        cycle(false);
      }
    }
  );
}

// Start after the page finishes loading.
document.addEventListener(
  "DOMContentLoaded",
  start
);
