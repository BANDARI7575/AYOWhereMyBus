
"use strict";

/* ==========================================================
   AYO! WHERE'S MY BUS?
   NEARBY MCTS BUS STOPS
   ========================================================== */

(() => {

  const API = "/api/stops/nearby";

  let stopMarkers = null;
  let locationMarker = null;

  /* ========================================================
     01. CREATE NEARBY STOPS INTERFACE
     ======================================================== */

  function createInterface() {
    const form = document.getElementById("routeForm");

    if (!form) return;

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

    form.insertAdjacentElement(
      "afterend",
      container
    );

    button.addEventListener(
      "click",
      findNearbyStops
    );
  }

  /* ========================================================
     02. STATUS MESSAGE
     ======================================================== */

  function setStopsStatus(message) {
    const element = document.getElementById(
      "stopsStatus"
    );

    if (element) {
      element.textContent = message;
    }
  }

  /* ========================================================
     03. FORMAT DISTANCE
     ======================================================== */

  function formatDistance(meters) {
    const value = Number(meters);

    if (!Number.isFinite(value)) {
      return "Unknown distance";
    }

    if (value < 1000) {
      return `${value} m away`;
    }

    return `${(value / 1000).toFixed(2)} km away`;
  }

  /* ========================================================
     04. DISPLAY BUS STOPS
     ======================================================== */

  function displayStops(stops) {
    const results = document.getElementById(
      "nearbyStopsResults"
    );

    if (!results) return;

    results.replaceChildren();

    if (!stops.length) {
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

      const title = document.createElement("strong");
      title.textContent =
        `${index + 1}. ${stop.stop_name}`;

      const subtitle = document.createElement("div");
      subtitle.textContent =
        `Stop ${stop.stop_code || stop.stop_id}`;

      subtitle.style.cssText = `
        color: #a8b2bd;
        font-size: 12px;
        margin-top: 4px;
      `;

      details.append(title, subtitle);

      const distance = document.createElement("span");
      distance.textContent = formatDistance(
        stop.distance_meters
      );

      distance.style.cssText = `
        color: #d2b995;
        font-size: 12px;
        white-space: nowrap;
      `;

      card.append(details, distance);

      card.addEventListener("click", () => {
        focusStop(stop);
      });

      results.append(card);
    });
  }

  /* ========================================================
     05. DISPLAY STOPS ON MAP
     ======================================================== */

  function showStopsOnMap(stops, userLocation) {
    if (
      !window.L ||
      !window.state ||
      !window.state.map
    ) {
      return;
    }

    const map = window.state.map;

    if (stopMarkers) {
      map.removeLayer(stopMarkers);
    }

    if (locationMarker) {
      map.removeLayer(locationMarker);
    }

    stopMarkers = L.layerGroup().addTo(map);

    const bounds = [];

    for (const stop of stops) {

      const position = [
        stop.latitude,
        stop.longitude
      ];

      const marker = L.circleMarker(position, {
        radius: 8,
        color: "#d2b995",
        weight: 2,
        fillColor: "#7eb8cf",
        fillOpacity: 0.95
      });

      const popup = document.createElement("div");

      const name = document.createElement("strong");
      name.textContent = stop.stop_name;

      const details = document.createElement("p");
      details.textContent =
        `Stop ${stop.stop_code || stop.stop_id} · ` +
        formatDistance(stop.distance_meters);

      popup.append(name, details);

      marker.bindPopup(popup);

      marker.addTo(stopMarkers);

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

    locationMarker.bindPopup("Your approximate location");
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
     06. FOCUS SELECTED STOP
     ======================================================== */

  function focusStop(stop) {
    if (
      !window.state ||
      !window.state.map
    ) {
      return;
    }

    const map = window.state.map;

    map.setView(
      [stop.latitude, stop.longitude],
      16
    );

    if (stopMarkers) {
      stopMarkers.eachLayer(marker => {
        const position = marker.getLatLng();

        if (
          Math.abs(position.lat - stop.latitude) < 0.000001 &&
          Math.abs(position.lng - stop.longitude) < 0.000001
        ) {
          marker.openPopup();
        }
      });
    }

    document.getElementById("map")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  /* ========================================================
     07. REQUEST LOCATION AND NEARBY STOPS
     ======================================================== */

  function findNearbyStops() {
    if (!navigator.geolocation) {
      setStopsStatus(
        "Your browser does not support location access."
      );
      return;
    }

    const button = document.getElementById(
      "findStopsButton"
    );

    button.disabled = true;
    button.textContent = "FINDING STOPS...";

    setStopsStatus(
      "Requesting your location..."
    );

    navigator.geolocation.getCurrentPosition(
      async position => {

        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        try {
          setStopsStatus(
            "Loading official MCTS bus stop locations..."
          );

          const url =
            `${API}?lat=${encodeURIComponent(location.latitude)}` +
            `&lon=${encodeURIComponent(location.longitude)}`;

          const response = await fetch(url, {
            cache: "no-store"
          });

          if (!response.ok) {
            throw new Error(
              `Stop API returned ${response.status}`
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
          console.error(error);

          setStopsStatus(
            "Unable to load nearby bus stops. Please try again."
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
     08. INITIALIZE
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
