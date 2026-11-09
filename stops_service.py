
"""Nearby MCTS bus stop discovery using GTFS data."""

import csv
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parent
STOPS_FILE = ROOT / "google_transit" / "stops.txt"


def load_stops():
    """Read bus stops from the MCTS GTFS file."""

    stops = []

    with STOPS_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:
            try:
                latitude = float(row["stop_lat"])
                longitude = float(row["stop_lon"])

                if not (
                    math.isfinite(latitude)
                    and math.isfinite(longitude)
                ):
                    continue

                if not (
                    -90 <= latitude <= 90
                    and -180 <= longitude <= 180
                ):
                    continue

                # Ignore non-boarding location records.
                if row.get("location_type", "").strip() not in (
                    "",
                    "0"
                ):
                    continue

                stops.append({
                    "stop_id": row["stop_id"],
                    "stop_code": row.get("stop_code", ""),
                    "stop_name": row["stop_name"],
                    "latitude": latitude,
                    "longitude": longitude
                })

            except (ValueError, KeyError, TypeError):
                continue

    return stops


def distance_km(lat1, lon1, lat2, lon2):
    """Calculate straight-line distance using Haversine."""

    radius = 6371.0

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )

    a = max(0.0, min(1.0, a))

    return 2 * radius * math.asin(math.sqrt(a))


def find_nearby_stops(latitude, longitude, limit=10):
    """Find the nearest MCTS stops to a GPS coordinate."""

    results = []

    for stop in load_stops():

        distance = distance_km(
            latitude,
            longitude,
            stop["latitude"],
            stop["longitude"]
        )

        results.append({
            **stop,
            "distance_meters": round(distance * 1000)
        })

    results.sort(
        key=lambda stop: stop["distance_meters"]
    )

    return results[:limit]
