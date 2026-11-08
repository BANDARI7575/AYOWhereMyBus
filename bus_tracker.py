
import requests
import json
from datetime import datetime, timezone
from google.transit import gtfs_realtime_pb2

# Milwaukee MCTS vehicle tracking feed
vehicle_url = "https://realtime.ridemcts.com/gtfsrt/vehicles"

# Step 1: Request bus data
response = requests.get(vehicle_url, timeout=10)
response.raise_for_status()

print("Status Code:", response.status_code)

# Step 2: Decode the GTFS real-time feed
feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(response.content)

# Step 3: Create a list to store bus data
buses = []

for entity in feed.entity:
    if entity.HasField("vehicle"):
        bus = entity.vehicle

        if bus.HasField("position"):
            bus_info = {
                "bus_id": bus.vehicle.id,
                "route": bus.trip.route_id,
                "latitude": bus.position.latitude,
                "longitude": bus.position.longitude
            }

            buses.append(bus_info)

# Step 4: Prepare the JSON data
data = {
    "last_updated": datetime.now(
        timezone.utc
    ).isoformat(),
    "total_buses": len(buses),
    "buses": buses
}

# Step 5: Save the data to a JSON file
with open("buses.json", "w") as file:
    json.dump(data, file, indent=4)

print("Total buses:", len(buses))
print("Successfully saved bus data to buses.json")
