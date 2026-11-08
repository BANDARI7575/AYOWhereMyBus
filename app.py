
from flask import Flask, jsonify, send_from_directory
import requests
from google.transit import gtfs_realtime_pb2

# Create Flask application
app = Flask(__name__)

# Milwaukee MCTS real-time bus data
VEHICLE_URL = "https://realtime.ridemcts.com/gtfsrt/vehicles"


# Step 1: Serve our website
@app.route("/")
def home():
    return send_from_directory(
        app.root_path,
        "index.html"
    )


# Step 2: Create the bus tracking API
@app.route("/api/buses")
def get_buses():
    try:
        # Connect to the Milwaukee transit server
        response = requests.get(
            VEHICLE_URL,
            timeout=10
        )

        response.raise_for_status()

        # Decode the GTFS real-time feed
        feed = gtfs_realtime_pb2.FeedMessage()

        feed.ParseFromString(response.content)

        # Create a list for bus information
        buses = []

        # Step 3: Extract vehicle information
        for entity in feed.entity:

            if not entity.HasField("vehicle"):
                continue

            vehicle = entity.vehicle

            if not vehicle.HasField("position"):
                continue

            # Only include entries with a route ID
            if not vehicle.HasField("trip"):
                continue

            route_id = vehicle.trip.route_id

            if not route_id:
                continue

            bus_info = {
                "bus_id": vehicle.vehicle.id,
                "route": route_id,
                "latitude": vehicle.position.latitude,
                "longitude": vehicle.position.longitude
            }

            buses.append(bus_info)

        # Step 4: Return JSON to the website
        return jsonify({
            "status": "success",
            "total_buses": len(buses),
            "buses": buses
        })

    except requests.RequestException as error:
        print("MCTS connection error:", error)

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve bus data"
        }), 502

    except Exception as error:
        print("Processing error:", error)

        return jsonify({
            "status": "error",
            "message": "Unable to process bus data"
        }), 500


# Step 5: Start the local development server
if __name__ == "__main__":
    print("Starting AYOWhereMyBus...")
    print("Open http://127.0.0.1:5000")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
