
"""AYOWhereMyBus | Milwaukee transit tracking backend.

Project notes:
    Flask serves our website and talks to the MCTS GTFS-Realtime feed.
    The browser never needs to decode protobuf itself. Teamwork!
"""

from datetime import datetime, timezone
from pathlib import Path
import time

import requests
from flask import Flask, jsonify, send_from_directory, request
from google.transit import gtfs_realtime_pb2

ROOT = Path(__file__).resolve().parent
FEED_URL = "https://realtime.ridemcts.com/gtfsrt/vehicles"
app = Flask(__name__, static_folder="static")

# Tiny cache: prevents several open tabs from hammering the transit server.
# I love buses, but let's not send 500 requests per second. 😅
CACHE_SECONDS = 10
_cache = {"time": 0.0, "payload": None}


def parse_vehicle_feed(raw: bytes) -> dict:
    """Convert GTFS-Realtime protobuf into browser-friendly JSON."""
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw)
    vehicles = []

    for entity in feed.entity:
        if not entity.HasField("vehicle"):
            continue

        v = entity.vehicle

        if not (v.HasField("position") and v.HasField("trip")):
            continue

        if not v.trip.route_id:
            continue

        p = v.position
        vehicle_id = (
            v.vehicle.id if v.HasField("vehicle") else entity.id
        )

        # GTFS speed is meters/second. Most humans prefer km/h here.
        speed = (
            round(p.speed * 3.6, 1)
            if p.HasField("speed")
            else None
        )

        heading = (
            round(p.bearing, 1)
            if p.HasField("bearing")
            else None
        )

        updated = (
            int(v.timestamp)
            if v.HasField("timestamp") and v.timestamp
            else None
        )

        vehicles.append({
            "bus_id": vehicle_id or entity.id,
            "route": v.trip.route_id,
            "latitude": round(p.latitude, 6),
            "longitude": round(p.longitude, 6),
            "speed_kmh": speed,
            "direction_degrees": heading,
            "reported_at": updated,
        })

    return {
        "status": "ok",
        "total_buses": len(vehicles),
        "feed_timestamp": (
            int(feed.header.timestamp)
            if feed.header.HasField("timestamp")
            else None
        ),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "buses": vehicles,
    }


def live_vehicles() -> dict:
    """Fetch new data only when the short in-memory cache expires."""
    now = time.monotonic()

    if (
        _cache["payload"] is not None
        and now - _cache["time"] < CACHE_SECONDS
    ):
        return _cache["payload"]

    response = requests.get(FEED_URL, timeout=12)
    response.raise_for_status()

    data = parse_vehicle_feed(response.content)

    _cache.update(
        time=now,
        payload=data
    )

    return data


@app.get("/")
def homepage():
    return send_from_directory(ROOT, "index.html")


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "AYOWhereMyBus"
    })


@app.get("/api/buses")
def buses():
    route = request.args.get("route", "").strip().upper()

    try:
        data = live_vehicles()

        # Route filter is optional; nearby-bus mode needs ALL vehicles.
        matching = [
            b for b in data["buses"]
            if not route or b["route"].upper() == route
        ]

        return jsonify({
            **{
                k: v
                for k, v in data.items()
                if k != "buses"
            },
            "buses": matching,
            "matches": len(matching),
            "selected_route": route or None,
        })

    except Exception as error:
        app.logger.warning("MCTS feed problem: %s", error)

        return jsonify({
            "status": "error",
            "message": "Live vehicle data is unavailable right now."
        }), 502


if __name__ == "__main__":
    # Local development only. Public launch needs proper production hosting.
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
