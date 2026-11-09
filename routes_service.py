
"""AYO! Where's My Bus? — MCTS stop route lookup.

Uses official GTFS schedule data to identify
which bus routes are associated with a stop.

This does not provide real-time arrivals.
"""

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GTFS = ROOT / "google_transit"

TRIPS_FILE = GTFS / "trips.txt"
STOP_TIMES_FILE = GTFS / "stop_times.txt"
ROUTES_FILE = GTFS / "routes.txt"


def routes_for_stop(stop_id):
    """Return scheduled routes serving a specific stop."""

    stop_id = str(stop_id).strip()

    if not stop_id:
        return []

    # STEP 1: Find trips that visit this stop.
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

    # STEP 2: Find the routes assigned to those trips.
    route_ids = set()

    with TRIPS_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:
            if row["trip_id"] in trip_ids:
                route_ids.add(row["route_id"])

    # STEP 3: Get the route names and numbers.
    results = []

    with ROUTES_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:
            if row["route_id"] not in route_ids:
                continue

            results.append({
                "route_id": row["route_id"],
                "route_number": (
                    row["route_short_name"]
                    or row["route_id"]
                ),
                "route_name": row["route_long_name"]
            })

    # STEP 4: Sort routes by their displayed number.
    results.sort(
        key=lambda route: route["route_number"]
    )

    return results
