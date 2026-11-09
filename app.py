
"""AYO! Where's My Bus? — Milwaukee transit tracking backend.

Run locally: python app.py

Features:
- Live MCTS GTFS-Realtime vehicle tracking
- Route-based bus searches
- Vehicle GPS freshness information
- Nearby MCTS bus stop discovery using GTFS data

GPS positions are not guaranteed arrival predictions.
"""

from datetime import datetime, timezone
from pathlib import Path
import math
import threading
import time

import requests
from feed_http import fetch_feed
from flask import Flask, jsonify, request, send_from_directory
from google.transit import gtfs_realtime_pb2

from stops_service import find_nearby_stops
from routes_service import routes_for_stop


# ==========================================================
# 01. APPLICATION CONFIGURATION
# ==========================================================

ROOT = Path(__file__).resolve().parent

FEED_URL = "https://realtime.ridemcts.com/gtfsrt/vehicles"

app = Flask(
    __name__,
    static_folder="static"
)

CACHE_SECONDS = 10

_cache = {
    "time": 0.0,
    "payload": None
}

_cache_lock = threading.Lock()


# ==========================================================
# 02. PARSE LIVE MCTS VEHICLE DATA
# ==========================================================

def parse_vehicle_feed(raw: bytes) -> dict:
    """Convert MCTS GTFS-Realtime vehicle data into JSON."""

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw)

    if not feed.IsInitialized():
        raise ValueError("Invalid vehicle feed")

    if feed.header.incrementality != 0:
        raise ValueError("Differential vehicle feeds are unsupported")

    buses = []

    for entity in feed.entity:

        if entity.is_deleted or not entity.HasField("vehicle"):
            continue

        vehicle = entity.vehicle

        if not vehicle.HasField("position"):
            continue

        if not vehicle.HasField("trip"):
            continue

        route = vehicle.trip.route_id.strip()

        if not route:
            continue

        pos = vehicle.position

        if not (
            math.isfinite(pos.latitude)
            and math.isfinite(pos.longitude)
        ):
            continue

        if not (
            -90 <= pos.latitude <= 90
            and -180 <= pos.longitude <= 180
        ):
            continue

        buses.append({
            "bus_id": (
                vehicle.vehicle.id
                if vehicle.HasField("vehicle")
                else ""
            ) or entity.id,

            "route": route,

            "latitude": round(
                pos.latitude,
                6
            ),

            "longitude": round(
                pos.longitude,
                6
            ),

            "speed_kmh": (
                round(pos.speed * 3.6, 1)
                if pos.HasField("speed") and math.isfinite(pos.speed) and pos.speed >= 0
                else None
            ),

            "direction_degrees": (
                round(pos.bearing, 1)
                if pos.HasField("bearing") and math.isfinite(pos.bearing) and 0 <= pos.bearing <= 360
                else None
            ),

            "trip_id": vehicle.trip.trip_id,

            "reported_at": (
                int(vehicle.timestamp)
                if vehicle.HasField("timestamp")
                and vehicle.timestamp
                else None
            ),
        })

    return {
        "status": "ok",

        "total_buses": len(buses),

        "feed_timestamp": (
            int(feed.header.timestamp)
            if feed.header.HasField("timestamp")
            else None
        ),

        "retrieved_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "buses": buses,
    }


# ==========================================================
# 03. GET LIVE MCTS VEHICLES
# ==========================================================

def live_vehicles() -> dict:
    """Fetch MCTS vehicles using a short-lived cache."""

    now = time.monotonic()

    with _cache_lock:

        if (
            _cache["payload"] is not None
            and now - _cache["time"] < CACHE_SECONDS
        ):
            return _cache["payload"]

        if now < _cache.get('retry_after',0):
            raise RuntimeError('Vehicle feed retry cooldown')
        try:
            parsed = parse_vehicle_feed(fetch_feed(FEED_URL))
        except Exception:
            _cache['retry_after']=time.monotonic()+10
            raise

        _cache.update(
            time=time.monotonic(),
            payload=parsed
        )

        return parsed


# ==========================================================
# 04. HOMEPAGE
# ==========================================================

@app.get("/")
def homepage():
    """Serve the AYO! website."""

    return send_from_directory(
        ROOT,
        "index.html"
    )


# ==========================================================
# 05. HEALTH CHECK
# ==========================================================

@app.get("/api/health")
def health():
    """Return backend service status."""

    return jsonify(
        status="ok",
        service="AYO! Where's My Bus?",
        planner_api_version=app.config.get('AYO_PLANNER_API_VERSION'),
        source_revision=app.config.get('AYO_SOURCE_REVISION'),
        started_at=app.config.get('AYO_STARTED_AT'),
    )


# ==========================================================
# 06. LIVE BUS TRACKING API
# ==========================================================

@app.get("/api/buses")
def buses():
    """Return all active buses or filter by route."""

    route = request.args.get(
        "route",
        ""
    ).strip().upper()

    allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ "

    if (
        len(route) > 12
        or any(char not in allowed for char in route)
    ):
        return jsonify(
            status="error",
            message="Invalid route value."
        ), 400

    try:

        data = live_vehicles()

        matching = [
            bus
            for bus in data["buses"]
            if (
                not route
                or bus["route"].upper() == route
            )
        ]

        feed_fresh=bool(data.get("feed_timestamp")) and -60 <= time.time()-data["feed_timestamp"] <= 180
        return jsonify({
            **{
                key: value
                for key, value in data.items()
                if key != "buses"
            },

            "feed_fresh": feed_fresh,
            "buses": [{**b, "age_seconds": int(time.time())-b["reported_at"] if b["reported_at"] else None, "reliability": "fresh" if feed_fresh and b["reported_at"] and -60 <= time.time()-b["reported_at"] <= 120 else "stale_or_unknown"} for b in matching],

            "matches": len(matching),

            "selected_route": route or None,
        })

    except Exception as error:

        app.logger.warning(
            "MCTS feed unavailable: %s",
            type(error).__name__
        )

        return jsonify(
            status="error",
            message="Live vehicle data is unavailable right now."
        ), 502


# ==========================================================
# 07. NEARBY MCTS BUS STOPS API
# ==========================================================

@app.get("/api/stops/nearby")
def nearby_stops():
    """Return the nearest MCTS bus stops to a GPS location."""

    try:

        latitude = float(
            request.args["lat"]
        )

        longitude = float(
            request.args["lon"]
        )

        # Validate geographic coordinates.
        if not (
            math.isfinite(latitude)
            and math.isfinite(longitude)
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        ):
            return jsonify(
                status="error",
                message="Invalid GPS coordinates."
            ), 400

        # Find the ten nearest official MCTS stops.
        stops = find_nearby_stops(
            latitude,
            longitude,
            limit=10
        )

        return jsonify(
            status="ok",
            count=len(stops),
            stops=stops,
            distance_type="straight_line"
        )

    except (KeyError, ValueError, TypeError):

        return jsonify(
            status="error",
            message="Provide valid lat and lon coordinates."
        ), 400

    except OSError:

        app.logger.exception(
            "Unable to read MCTS bus stop data"
        )

        return jsonify(
            status="error",
            message="Bus stop data is unavailable."
        ), 503


# ==========================================================
# 08. START DEVELOPMENT SERVER
# ==========================================================
# ==========================================================
# 08. ROUTES SERVING AN MCTS BUS STOP
# ==========================================================

@app.get("/api/stops/<stop_id>/routes")
def stop_routes(stop_id):
    """Return scheduled MCTS routes serving a bus stop."""

    # Accept numeric GTFS stop IDs only.
    if not stop_id.isdigit() or len(stop_id) > 12:
        return jsonify(
            status="error",
            message="Invalid bus stop ID."
        ), 400

    try:
        routes = routes_for_stop(stop_id)

        return jsonify(
            status="ok",
            stop_id=stop_id,
            count=len(routes),
            routes=routes,
            data_type="scheduled",
            message=(
                "Routes are from the downloaded MCTS "
                "schedule, not live arrival predictions."
            )
        )

    except OSError:
        app.logger.exception(
            "Unable to read MCTS route data"
        )

        return jsonify(
            status="error",
            message="Bus route data is unavailable."
        ), 503
from release_api import install
install(app)

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
