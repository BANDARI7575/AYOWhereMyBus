vehicle_url = "https://realtime.ridemcts.com/gtfsrt/vehicles"
import requests
from google.transit import gtfs_realtime_pb2
response = requests.get(vehicle_url, timeout=10)
print("Status Code:", response.status_code)
feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(response.content)
print("Total vehicles:", len(feed.entity))