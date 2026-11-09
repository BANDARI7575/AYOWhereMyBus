
"""AYO! Where's My Bus? — MCTS stop-specific route lookup.

Uses GTFS schedule files to identify which routes and
scheduled destinations serve a particular bus stop.

Does not provide real-time arrivals or current service status.
"""

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GTFS = ROOT / "google_transit"

TRIPS_FILE = GTFS / "trips.txt"
STOP_TIMES_FILE = GTFS / "stop_times.txt"
ROUTES_FILE = GTFS / "routes.txt"


def routes_for_stop(stop_id):
    """Find scheduled routes and destinations serving a stop."""

    stop_id = str(stop_id).strip()

    if not stop_id:
        return []

    # STEP 1: Find trips that actually visit this stop.
    trip_ids = set()

    with STOP_TIMES_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:
        reader = csv.DictReader(file)

        for row in reader:
            if row["stop_id"] == stop_id:
                trip_ids.add(row["trip_id"])

    if not trip_ids:
        return []

    # STEP 2: Match those trips to routes and destinations.
    route_destinations = {}

    with TRIPS_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:
        reader = csv.DictReader(file)

        for row in reader:
            if row["trip_id"] not in trip_ids:
                continue

            route_id = row["route_id"]
            direction_id = row["direction_id"].strip()
            headsign = row["trip_headsign"].strip()

            if route_id not in route_destinations:
                route_destinations[route_id] = set()

            route_destinations[route_id].add(
                (direction_id, headsign)
            )

    # STEP 3: Add route names from routes.txt.
    results = []

    with ROUTES_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:
        reader = csv.DictReader(file)

        for row in reader:
            route_id = row["route_id"]

            if route_id not in route_destinations:
                continue

            destinations = [
                {
                    "direction_id": direction,
                    "headsign": headsign
                }
                for direction, headsign in sorted(
                    route_destinations[route_id]
                )
            ]

            results.append({
                "route_id": route_id,
                "route_number": (
                    row["route_short_name"]
                    or route_id
                ),
                "route_name": row["route_long_name"],
                "destinations": destinations
            })

    # STEP 4: Sort by displayed route number.
    results.sort(
        key=lambda route: route["route_number"]
    )

    return results
