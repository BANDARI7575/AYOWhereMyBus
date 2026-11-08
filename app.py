
from flask import Flask, jsonify
import requests
from google.transit import gtfs_realtime_pb2

# Create our Flask application
app = Flask(__name__)

# Milwaukee MCTS live bus data
VEHICLE_URL = "https://realtime.ridemcts.com/gtfsrt/vehicles"


# Create an API endpoint
@app.route("/api/buses")
def get_buses():
    try:
        # Request live bus data
        response = requests.get(VEHICLE_URL, timeout=10)
        response.raise_for_status()

        # Decode the GTFS feed
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        buses = []

        # Extract bus information
        for entity in feed.entity:
            if entity.HasField("vehicle"):
                vehicle = entity.vehicle

                if vehicle.HasField("position"):
                    buses.append({
                        "bus_id": vehicle.vehicle.id,
                        "route": vehicle.trip.route_id,
                        "latitude": vehicle.position.latitude,
                        "longitude": vehicle.position.longitude
                    })

        # Return JSON to the website
        return jsonify({
            "total_buses": len(buses),
            "buses": buses
        })

    except Exception as error:
        return jsonify({
            "error": str(error)
        }), 500


# Start Flask server
if __name__ == "__main__":
    app.run(debug=True, port=5000)
