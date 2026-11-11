
"use strict";

/* ==========================================================
   AYO! WHERE'S MY BUS?
   NEARBY MCTS STOPS + ROUTES SERVING EACH STOP
   ========================================================== */

(() => {
  const STOPS_API = "/api/stops/nearby";

  let stopMarkers = null;
  let locationMarker = null;

  const markerByStopId = new Map();
  const routesCache = new Map();

  function getMap() {
    return window.state?.map || null;
  }

  /* ========================================================
     01. CREATE STOPS INTERFACE
     ======================================================== */

  function createInterface() {
    const form = document.getElementById("routeForm");

    if (!form) return;

    if (document.getElementById("nearbyStopsPanel")) {
      return;
    }

    const container = document.createElement("section");
    container.id = "nearbyStopsPanel";

    container.style.cssText = `
      margin-top: 24px;
      padding: 22px;
      border: 1px solid #39434e;
      border-radius: 10px;
      background: #131a22;
      color: #e8edf1;
    `;

    const heading = document.createElement("h3");
    heading.textContent = "Nearby MCTS Bus Stops";

    heading.style.cssText = `
      margin: 0 0 8px;
      color: #d2b995;
      font-size: 23px;
    `;

    const description = document.createElement("p");
    description.textContent =
      "Find real MCTS bus stops close to your location.";

    description.style.cssText = `
      color: #a8b2bd;
      font-size: 13px;
    `;

    const button = document.createElement("button");
    button.id = "findStopsButton";
    button.type = "button";
    button.className = "gold-button";
    button.textContent = "⌖ FIND NEARBY STOPS";

    const status = document.createElement("p");
    status.id = "stopsStatus";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    status.style.cssText = `
      margin-top: 14px;
      color: #a8b2bd;
      font-size: 13px;
    `;

    const results = document.createElement("div");
    results.id = "nearbyStopsResults";

    results.style.cssText = `
      display: grid;
      gap: 10px;
      margin-top: 14px;
    `;

    container.append(
      heading,
      description,
      button,
      status,
      results
    );

    form.insertAdjacentElement("afterend", container);

    button.addEventListener("click", findNearbyStops);
  }

  /* ========================================================
     02. HELPERS
     ======================================================== */

  function setStopsStatus(message) {
    const element = document.getElementById("stopsStatus");

    if (element) {
      element.textContent = message;
    }
  }

  function formatDistance(meters) {
    const value = Number(meters);

    if (!Number.isFinite(value)) {
      return "Unknown distance";
    }

    if (value < 1000) {
      return `${Math.round(value)} m away`;
    }

    return `${(value / 1000).toFixed(2)} km away`;
  }

  function createText(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
  }

  /* ========================================================
     03. FETCH ROUTES SERVING A STOP
     ======================================================== */

  async function getRoutesForStop(stopId) {
    const id = String(stopId);

    if (routesCache.has(id)) {
      return routesCache.get(id);
    }

    const url =
      `/api/stops/${encodeURIComponent(id)}/routes`;

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Route lookup returned ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.routes)) {
      throw new Error("Invalid route information.");
    }

    routesCache.set(id, data.routes);

    return data.routes;
  }

  /* ========================================================
     04. CREATE STOP POPUP
     ======================================================== */

  function createStopPopup(stop) {
    const popup = document.createElement("div");

    popup.style.cssText = `
      min-width: 210px;
      color: #e8edf1;
    `;

    const title = createText(
      "strong",
      stop.stop_name
    );

    title.style.cssText = `
      display: block;
      color: #d2b995;
      font-size: 16px;
      margin-bottom: 8px;
    `;

    const details = createText(
      "p",
      `Stop ${stop.stop_code || stop.stop_id} · ` +
      formatDistance(stop.distance_meters)
    );

    details.style.cssText = `
      font-size: 12px;
      color: #a8b2bd;
    `;

    const routeTitle = createText(
      "strong",
      "ROUTES SERVING THIS STOP"
    );

    routeTitle.style.cssText = `
      display: block;
      margin-top: 12px;
      font-size: 11px;
      letter-spacing: 0.06em;
      color: #d2b995;
    `;

    const routesHolder = document.createElement("div");

    routesHolder.textContent = "Loading routes...";

    routesHolder.style.cssText = `
      margin-top: 8px;
      font-size: 13px;
    `;

    const note = createText(
      "p",
      "Routes are based on downloaded MCTS schedule data. " +
      "They are not live arrival predictions."
    );

    note.style.cssText = `
      margin-top: 12px;
      font-size: 11px;
      color: #a8b2bd;
      line-height: 1.5;
    `;

    popup.append(
      title,
      details,
      routeTitle,
      routesHolder,
      note
    );

    getRoutesForStop(stop.stop_id)
      .then(routes => {
        routesHolder.replaceChildren();

        if (routes.length === 0) {
          routesHolder.textContent =
            "No scheduled routes found in this dataset.";
          return;
        }

for (const route of routes) {
  const routeBox = document.createElement("div");

  routeBox.style.cssText = `
    margin: 10px 0;
    padding-bottom: 9px;
    border-bottom: 1px solid #39434e;
  `;

  const heading = createText(
    "strong",
    `Route ${route.route_number} — ${route.route_name}`
  );

  heading.style.color = "#d2b995";
  routeBox.append(heading);

  if (Array.isArray(route.destinations)) {
    for (const destination of route.destinations) {
      const line = createText(
        "p",
        `↳ ${destination.headsign || "Destination unavailable"}`
      );

      line.style.cssText = `
        margin: 5px 0 5px 10px;
        color: #e8edf1;
        font-size: 12px;
      `;

      routeBox.append(line);
    }
  }

  routesHolder.append(routeBox);
}
      })
      .catch(error => {
        console.warn("Route lookup failed:", error);

        routesHolder.textContent =
          "Route information is unavailable right now.";
      });

    return popup;
  }

  /* ========================================================
     05. DISPLAY NEARBY STOP CARDS
     ======================================================== */

  function displayStops(stops) {
    const results = document.getElementById(
      "nearbyStopsResults"
    );

    if (!results) return;

    results.replaceChildren();

    if (stops.length === 0) {
      setStopsStatus("No nearby stops found.");
      return;
    }

    setStopsStatus(
      `${stops.length} nearest MCTS stops found.`
    );

    stops.forEach((stop, index) => {
      const card = document.createElement("button");

      card.type = "button";

      card.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        text-align: left;
        padding: 15px;
        background: #1c2530;
        color: #e8edf1;
        border: 1px solid #39434e;
        border-radius: 8px;
        cursor: pointer;
      `;

      const details = document.createElement("div");

      const title = createText(
        "strong",
        `${index + 1}. ${stop.stop_name}`
      );

      const subtitle = createText(
        "div",
        `Stop ${stop.stop_code || stop.stop_id}`
      );

      subtitle.style.cssText = `
        color: #a8b2bd;
        font-size: 12px;
        margin-top: 4px;
      `;

      details.append(title, subtitle);

      const distance = createText(
        "span",
        formatDistance(stop.distance_meters)
      );

      distance.style.cssText = `
        color: #d2b995;
        font-size: 12px;
        white-space: nowrap;
      `;

      card.append(details, distance);

      card.addEventListener("click", () => {
        focusStop(stop);
        window.ayoLoadStop?.(stop.stop_id);
      });

      results.append(card);
    });
  }

  /* ========================================================
     06. DRAW STOP MARKERS
     ======================================================== */

  function showStopsOnMap(stops, userLocation) {
    const map = getMap();

    if (!map || !window.L) {
      setStopsStatus(
        "Stops found, but the map is unavailable."
      );
      return;
    }

    if (stopMarkers) {
      map.removeLayer(stopMarkers);
    }

    if (locationMarker) {
      map.removeLayer(locationMarker);
    }

    markerByStopId.clear();

    stopMarkers = L.layerGroup().addTo(map);

    const bounds = [];

    for (const stop of stops) {
      const position = [
        Number(stop.latitude),
        Number(stop.longitude)
      ];

      const marker = L.circleMarker(position, {
        radius: 8,
        color: "#d2b995",
        weight: 2,
        fillColor: "#7eb8cf",
        fillOpacity: 0.95
      });

      marker.bindPopup(
        createText("span", stop.stop_name)
      );

      marker.on("popupopen", () => {
        marker.setPopupContent(
          createStopPopup(stop)
        );
      });

      marker.addTo(stopMarkers);

      markerByStopId.set(
        String(stop.stop_id),
        marker
      );

      bounds.push(position);
    }

    const userPosition = [
      userLocation.latitude,
      userLocation.longitude
    ];

    locationMarker = L.circleMarker(userPosition, {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: "#397db2",
      fillOpacity: 1
    });

    locationMarker.bindPopup(
      "Your approximate location"
    );

    locationMarker.addTo(map);

    bounds.push(userPosition);

    if (bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 15
      });
    }
  }

  /* ========================================================
     07. FOCUS A STOP FROM THE LIST
     ======================================================== */

  function focusStop(stop) {
    const map = getMap();

    if (!map) {
      setStopsStatus("The map is unavailable.");
      return;
    }

    map.setView(
      [stop.latitude, stop.longitude],
      16
    );

    const marker = markerByStopId.get(
      String(stop.stop_id)
    );

    if (marker) {
      marker.openPopup();
    }

    document.getElementById("map")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  /* ========================================================
     08. FIND NEARBY STOPS
     ======================================================== */

  function findNearbyStops() {
    if (!navigator.geolocation) {
      setStopsStatus(
        "Location access is not supported."
      );
      return;
    }

    const button = document.getElementById(
      "findStopsButton"
    );

    button.disabled = true;
    button.textContent = "FINDING STOPS...";

    setStopsStatus("Requesting your location...");

    navigator.geolocation.getCurrentPosition(
      async position => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        try {
          setStopsStatus("Loading MCTS stops...");

          const url =
            `${STOPS_API}?lat=${encodeURIComponent(location.latitude)}` +
            `&lon=${encodeURIComponent(location.longitude)}`;

          const response = await fetch(url, {
            cache: "no-store"
          });

          if (!response.ok) {
            throw new Error(
              `Stop search returned ${response.status}`
            );
          }

          const data = await response.json();

          if (!Array.isArray(data.stops)) {
            throw new Error("Invalid stop data.");
          }

          displayStops(data.stops);

          showStopsOnMap(
            data.stops,
            location
          );

        } catch (error) {
          console.error("Nearby stops failed:", error);

          setStopsStatus(
            "Unable to load nearby stops. Please try again."
          );

        } finally {
          button.disabled = false;
          button.textContent = "⌖ FIND NEARBY STOPS";
        }
      },

      error => {
        button.disabled = false;
        button.textContent = "⌖ FIND NEARBY STOPS";

        setStopsStatus(
          "Location unavailable or permission denied."
        );

        console.warn(
          "Location request failed:",
          error.message
        );
      },

      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  }

  /* ========================================================
     09. START
     ======================================================== */

  function start() {
    createInterface();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

})();
