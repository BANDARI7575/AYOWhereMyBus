
/* ============================================================
   AYOWhereMyBus - PREMIUM EDITION
   FRONTEND JAVASCRIPT

   Created for our Milwaukee transit project.

   CONTENTS:
   01 - Settings and variables
   02 - Helper functions
   03 - Milwaukee map
   04 - Yellow bus icons
   05 - Bus information popups
   06 - Live MCTS bus tracking
   07 - Automatic refresh
   08 - Favorite routes
   09 - Nearby buses
   10 - English and Spanish
   11 - Day and night mode
   12 - Milwaukee clock
   13 - Connect everything

   Note:
   The buses are real.
   The bugs were also real. Unfortunately. 😂
   ============================================================ */

"use strict";


// ============================================================
// 01 - SETTINGS AND VARIABLES
// ============================================================

// Shortcut to find an HTML element using its ID.
const $ = (id) => document.getElementById(id);

// Our Flask backend API.
const API = "/api/buses";

// Refresh bus information every 15 seconds.
const REFRESH_MS = 15000;

// Milwaukee city center.
const CENTER = [43.0389, -87.9065];

// Store information used by our website.
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
    favorites: []
};


// ============================================================
// 02 - HELPER FUNCTIONS
// ============================================================

// Read saved settings from the browser.
function safelyLoad(key, fallback) {
    try {
        return JSON.parse(
            localStorage.getItem(key)
        ) ?? fallback;
    } catch {
        return fallback;
    }
}


// Save settings in the browser.
function safelySave(key, value) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    } catch {
        // Private browsing might block storage.
        // That's okay. Our buses don't need cookies. 😂
    }
}


// Display a message to the user.
function status(message, warning = false) {
    const element = $("message");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.style.color = warning
        ? "#e8aa81"
        : "var(--muted)";
}


// Convert a Unix timestamp into readable time.
function stamp(seconds) {
    if (
        seconds === null ||
        seconds === undefined ||
        !Number.isFinite(Number(seconds))
    ) {
        return "Unknown";
    }

    return new Date(
        Number(seconds) * 1000
    ).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}


// Calculate vehicle report age in minutes.
function vehicleAge(seconds) {
    if (
        seconds === null ||
        seconds === undefined ||
        !Number.isFinite(Number(seconds))
    ) {
        return null;
    }

    return Math.max(
        0,
        Math.floor(
            (Date.now() / 1000 - Number(seconds)) / 60
        )
    );
}


// Convert direction degrees into compass direction.
function bearing(degrees) {
    if (
        degrees === null ||
        degrees === undefined ||
        !Number.isFinite(Number(degrees))
    ) {
        return "Unknown";
    }

    const directions = [
        "North",
        "Northeast",
        "East",
        "Southeast",
        "South",
        "Southwest",
        "West",
        "Northwest"
    ];

    const normalized =
        ((Number(degrees) % 360) + 360) % 360;

    const index =
        Math.round(normalized / 45) % 8;

    return (
        directions[index] +
        " (" + Math.round(normalized) + "°)"
    );
}


// Calculate distance between two GPS positions.
// We use the Haversine formula.
//
// Yes, the name sounds like a Harry Potter spell. 🪄
function kmBetween(a, b) {
    const rad = (value) => value * Math.PI / 180;

    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.latitude)) *
        Math.cos(rad(b.latitude)) *
        Math.sin(dLon / 2) ** 2;

    return (
        6371 *
        2 *
        Math.atan2(
            Math.sqrt(h),
            Math.sqrt(1 - h)
        )
    );
}


// ============================================================
// 03 - CREATE THE MILWAUKEE MAP
// ============================================================

function initializeMap() {

    // Check if Leaflet loaded correctly.
    if (!window.L) {
        status(
            "The map library did not load. Check your internet connection.",
            true
        );

        return;
    }

    // Create our interactive map.
    state.map = L.map("map", {
        scrollWheelZoom: false
    }).setView(CENTER, 11);

    // OpenStreetMap background.
    //
    // Goodbye, giant API KEY REQUIRED message.
    // You will not be missed. 😂
    L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(state.map);

    // Create a layer to hold our bus markers.
    state.markers = L.layerGroup().addTo(state.map);
}


// ============================================================
// 04 - CUSTOM YELLOW BUS ICONS
// ============================================================

// We're using bus symbols, not dots or Batman logos.
//
// Batman can fly in the homepage.
// The buses need to stay on the roads. 🦇🚌

function createBusIcon() {
    return L.divIcon({
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -23],

        html: `
            <div class="bus-icon">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <rect
                        x="5"
                        y="3"
                        width="14"
                        height="17"
                        rx="3"
                    />

                    <path
                        d="M5 12h14M8 20v2M16 20v2M8 7h8M8 16h.01M16 16h.01"
                    />
                </svg>
            </div>
        `
    });
}


// ============================================================
// 05 - BUS INFORMATION POPUPS
// ============================================================

// Add one information row to a popup.
function addPopupRow(container, label, value) {
    const row = document.createElement("div");
    row.className = "popup-row";

    const left = document.createElement("span");
    left.textContent = label;

    const right = document.createElement("strong");
    right.textContent = String(value);

    row.append(left, right);
    container.append(row);
}


// Create a popup for each bus.
function createBusPopup(bus) {
    const root = document.createElement("div");

    const title = document.createElement("h4");
    title.className = "popup-title";
    title.textContent = "🚌 AYOWhereMyBus";

    root.append(title);

    addPopupRow(
        root,
        "Bus ID",
        bus.bus_id || "Unknown"
    );

    addPopupRow(
        root,
        "Route",
        bus.route || "Unknown"
    );

    // Speed is supplied by MCTS when available.
    const speed = bus.speed_kmh == null
        ? "Not reported"
        : `${bus.speed_kmh} km/h`;

    addPopupRow(root, "Speed", speed);

    addPopupRow(
        root,
        "Heading",
        bearing(bus.direction_degrees)
    );

    addPopupRow(
        root,
        "Reported",
        stamp(bus.reported_at)
    );

    const note = document.createElement("p");
    note.className = "popup-note";

    note.textContent =
        "Last reported values. Not a predicted arrival.";

    root.append(note);

    return root;
}


// ============================================================
// 06 - DISPLAY BUS MARKERS ON THE MAP
// ============================================================

function showBuses(buses, zoom = false) {
    if (!state.map || !state.markers) {
        return;
    }

    // Remove previous bus markers.
    state.markers.clearLayers();

    const points = [];
    const busIcon = createBusIcon();

    for (const bus of buses) {
        const latitude = Number(bus.latitude);
        const longitude = Number(bus.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            continue;
        }

        const position = [
            latitude,
            longitude
        ];

        // Create one yellow bus marker.
        const marker = L.marker(position, {
            icon: busIcon,
            title:
                `Bus ${bus.bus_id}, Route ${bus.route}`
        });

        // Show information when marker is clicked.
        marker.bindPopup(createBusPopup(bus));

        // Add marker to the map.
        marker.addTo(state.markers);

        points.push(position);
    }

    // Zoom to matching buses on the first search.
    // Don't interrupt the user's zoom every 15 seconds.
    if (zoom && points.length > 0) {
        state.map.fitBounds(points, {
            padding: [45, 45],
            maxZoom: 14
        });
    }
}


// ============================================================
// 07 - FETCH LIVE MILWAUKEE BUS DATA
// ============================================================

// Our data flow:
//
// MCTS → Python Flask → JavaScript → Map
//
// Four different technologies working together.
// Meanwhile, I sometimes forget where I put my keys. 😭

async function refresh(zoom = false) {
    if (
        document.hidden ||
        state.mode === "idle" ||
        state.request
    ) {
        return;
    }

    const controller = new AbortController();
    const currentVersion = state.version;

    state.request = controller;

    $("connectionBadge").textContent =
        "● CONNECTING";

    try {
        // Request all buses or only one route.
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

        // Ignore responses from an old search.
        if (
            controller.signal.aborted ||
            currentVersion !== state.version
        ) {
            return;
        }

        if (!Array.isArray(data.buses)) {
            throw new Error(
                "Invalid bus data received."
            );
        }

        let buses = data.buses;

        // Nearby mode shows reported buses within 3 km.
        // Bus stops are a separate upcoming feature.
        if (
            state.mode === "nearby" &&
            state.position
        ) {
            buses = buses
                .map(bus => ({
                    ...bus,
                    distance: kmBetween(
                        state.position,
                        bus
                    )
                }))
                .filter(bus => bus.distance <= 3)
                .sort(
                    (a, b) => a.distance - b.distance
                )
                .slice(0, 30);
        }

        // Update the map.
        showBuses(buses, zoom);

        // Display number of buses.
        $("busCount").textContent =
            `${buses.length} buses`;

        $("connectionBadge").textContent =
            "● LIVE FEED REACHED";

        $("trackingState").textContent =
            "● AUTO TRACKING ACTIVE";

        $("refreshTime").textContent =
            "LAST REQUEST: " +
            new Date().toLocaleTimeString();

        // Check how old the source vehicle reports are.
        const ages = buses
            .map(bus => vehicleAge(bus.reported_at))
            .filter(age => age !== null);

        const oldest = ages.length
            ? Math.max(...ages)
            : null;

        $("dataFreshness").textContent =
            oldest === null
                ? "VEHICLE AGE: UNKNOWN"
                : `OLDEST REPORT: ${oldest} MIN`;

        // Warn users when bus information is old.
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
        if (
            error.name !== "AbortError" &&
            currentVersion === state.version
        ) {
            $("connectionBadge").textContent =
                "● CONNECTION LOST";

            $("trackingState").textContent =
                "● TRYING AGAIN";

            status(
                "Cannot refresh right now. Existing markers may be outdated.",
                true
            );

            console.error(
                "Bus request failed:",
                error
            );
        }

    } finally {
        if (state.request === controller) {
            state.request = null;
        }
    }
}


// ============================================================
// 08 - AUTOMATIC REFRESH EVERY 15 SECONDS
// ============================================================

// Use a timer after the previous request finishes.
// We don't want 100 requests fighting over one bus. 😅

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


// Start one refresh cycle.
async function cycle(
    zoom = false,
    version = state.version
) {
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


// Search for a particular bus route.
function searchRoute(route) {
    const cleaned = String(route).trim().toUpperCase();

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

    status(
        `Searching Route ${cleaned}...`
    );

    renderFavorites();
    cycle(true);
}


// ============================================================
// 09 - SAVE FAVORITE ROUTES
// ============================================================

// Favorite routes are saved in the browser.
// No account needed yet.

function renderFavorites() {
    const holder = $("favorites");

    holder.replaceChildren();

    for (const route of state.favorites) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "favorite-chip";
        button.textContent = `★ ${route}`;

        button.addEventListener("click", () => {
            searchRoute(route);
        });

        holder.append(button);
    }

    $("favoriteButton").textContent =
        state.favorites.includes(state.route) &&
        state.route
            ? "★ Remove saved route"
            : "☆ Save this route";
}


// Add or remove a saved route.
function toggleFavorite() {
    if (!state.route) {
        status(
            "Search a route first, then save it.",
            true
        );
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

    safelySave(
        "ayo-favorites",
        state.favorites
    );

    renderFavorites();
}


// ============================================================
// 10 - FIND BUSES NEAR ME
// ============================================================

// We ask for location permission.
// We never secretly collect anyone's GPS position.

function nearMe() {
    if (!navigator.geolocation) {
        status(
            "Your browser does not support location.",
            true
        );
        return;
    }

    status(
        "Requesting location permission..."
    );

    navigator.geolocation.getCurrentPosition(
        position => {
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

        () => {
            status(
                "Location unavailable or permission denied. Route search still works.",
                true
            );
        },

        {
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 30000
        }
    );
}


// ============================================================
// 11 - ENGLISH AND SPANISH LANGUAGE SUPPORT
// ============================================================

const translations = {
    en: {
        navHome: "Home",
        navMap: "Live Map",
        navFeatures: "The Future",
        navAbout: "Creator",

        eyebrow:
            "MILWAUKEE // TRANSIT INTELLIGENCE",

        heroTitle:
            "THE CITY<br>NEVER <em>WAITS.</em>",

        heroSubtitle:
            "Know your route. Spend less time standing in the cold.",

        findRide: "FIND YOUR RIDE ↗",

        builtFor:
            "Built for the streets of Milwaukee.",

        mapHeading:
            "Find your <em>ride.</em>",

        routeLookup:
            "BUS ROUTE LOOKUP",

        routeHelp:
            "Enter a route like 19, 21, BLU, or PUR.",

        search: "SEARCH ROUTE ↗",
        nearby: "⌖ NEAR ME",

        mapTitle:
            'MILWAUKEE <span class="gold">LIVE MAP</span>',

        featureHeading:
            'More than <em>a map.</em>',

        disclaimer:
            "Independent project. Map positions are last reported by MCTS, not guaranteed arrivals. Updates requested every 15 seconds while the tab is open."
    },

    es: {
        navHome: "Inicio",
        navMap: "Mapa en vivo",
        navFeatures: "Próximamente",
        navAbout: "Creador",

        eyebrow:
            "MILWAUKEE // INFORMACIÓN DE TRÁNSITO",

        heroTitle:
            "LA CIUDAD<br>NUNCA <em>ESPERA.</em>",

        heroSubtitle:
            "Conoce tu ruta. Pasa menos tiempo esperando en el frío.",

        findRide:
            "ENCUENTRA TU BUS ↗",

        builtFor:
            "Hecho para las calles de Milwaukee.",

        mapHeading:
            "Encuentra tu <em>bus.</em>",

        routeLookup:
            "BUSCAR RUTA",

        routeHelp:
            "Escribe una ruta como 19, 21, BLU o PUR.",

        search:
            "BUSCAR RUTA ↗",

        nearby:
            "⌖ CERCA DE MÍ",

        mapTitle:
            'MILWAUKEE <span class="gold">MAPA EN VIVO</span>',

        featureHeading:
            'Más que <em>un mapa.</em>',

        disclaimer:
            "Proyecto independiente. El mapa muestra la última posición reportada por MCTS, no una hora de llegada garantizada. Se solicitan datos cada 15 segundos."
    }
};


// Translate our website.
function translate() {
    const dictionary = translations[state.language];

    document.documentElement.lang = state.language;

    // Normal text translation.
    document.querySelectorAll(
        "[data-i18n]"
    ).forEach(element => {
        const key = element.dataset.i18n;

        // Map title needs a gold-colored HTML span.
        // Without this check, HTML tags show as text.
        // We learned that one the hard way. 😂
        if (key === "mapTitle") {
            element.innerHTML = dictionary.mapTitle;
        } else if (dictionary[key] !== undefined) {
            element.textContent = dictionary[key];
        }
    });

    // Special headings containing trusted HTML.
    document.querySelectorAll(
        "[data-i18n-html]"
    ).forEach(element => {
        const key = element.dataset.i18nHtml;

        if (dictionary[key] !== undefined) {
            element.innerHTML = dictionary[key];
        }
    });

    $("languageButton").textContent =
        state.language === "en"
            ? "ES"
            : "EN";
}


// ============================================================
// 12 - DAY/NIGHT MODE AND MILWAUKEE CLOCK
// ============================================================

function updateClock() {
    $("clock").textContent =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: "America/Chicago",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short"
            }
        ).format(new Date());
}


// ============================================================
// 13 - CONNECT EVERYTHING TO THE WEBSITE
// ============================================================

// Everything starts here.
// If this function doesn't run, our beautiful website
// becomes a very expensive-looking poster. 😂

function start() {

    // Load saved favorites.
    const favorites = safelyLoad(
        "ayo-favorites",
        []
    );

    state.favorites = Array.isArray(favorites)
        ? favorites.filter(x => typeof x === "string")
        : [];

    // Load preferred language.
    state.language =
        safelyLoad("ayo-language", "en") === "es"
            ? "es"
            : "en";

    // Restore appearance.
    if (safelyLoad("ayo-day-mode", false)) {
        document.body.classList.add("day-mode");
    }

    // Initialize interface.
    translate();
    renderFavorites();
    updateClock();
    initializeMap();

    // Keep Milwaukee clock updated.
    setInterval(updateClock, 30000);


    // ----------------------------------------
    // ROUTE SEARCH
    // ----------------------------------------

    $("routeForm").addEventListener(
        "submit",
        event => {
            event.preventDefault();

            searchRoute(
                $("routeInput").value
            );
        }
    );


    // ----------------------------------------
    // NEARBY BUSES
    // ----------------------------------------

    $("nearbyButton").addEventListener(
        "click",
        nearMe
    );


    // ----------------------------------------
    // FAVORITE ROUTES
    // ----------------------------------------

    $("favoriteButton").addEventListener(
        "click",
        toggleFavorite
    );


    // ----------------------------------------
    // LANGUAGE SWITCH
    // ----------------------------------------

    $("languageButton").addEventListener(
        "click",
        () => {
            state.language =
                state.language === "en"
                    ? "es"
                    : "en";

            safelySave(
                "ayo-language",
                state.language
            );

            translate();
        }
    );


    // ----------------------------------------
    // DAY/NIGHT APPEARANCE
    // ----------------------------------------

    $("themeButton").addEventListener(
        "click",
        () => {
            document.body.classList.toggle(
                "day-mode"
            );

            safelySave(
                "ayo-day-mode",
                document.body.classList.contains(
                    "day-mode"
                )
            );
        }
    );


    // ----------------------------------------
    // PAUSE TRACKING WHEN TAB IS HIDDEN
    // ----------------------------------------

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


// Start once HTML has finished loading.
document.addEventListener(
    "DOMContentLoaded",
    start
);
