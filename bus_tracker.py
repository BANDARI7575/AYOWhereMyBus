
import requests
from google.transit import gtfs_realtime_pb2

# Milwaukee MCTS real-time vehicle tracking URL
vehicle_url = "https://realtime.ridemcts.com/gtfsrt/vehicles"

# Step 1: Connect to the server
response = requests.get(vehicle_url, timeout=10)

# Step 2: Check connection
print("Status Code:", response.status_code)
response.raise_for_status()

# Step 3: Decode real-time bus data
feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(response.content)

# Step 4: Count entries
print("Total vehicles:", len(feed.entity))

# Step 5: Display information for the first bus
for entity in feed.entity:
    if entity.HasField("vehicle"):
        bus = entity.vehicle

        print("----------------------")
        print("Bus ID:", bus.vehicle.id)
        print("Route:", bus.trip.route_id)
        print("Latitude:", bus.position.latitude)
        print("Longitude:", bus.position.longitude)
        print("----------------------")

        break
