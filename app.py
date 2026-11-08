
from flask import Flask, jsonify, send_from_directory
import requests
from google.transit import gtfs_realtime_pb2

# Create Flask application
app = Flask(__name__)

# Milwaukee MCTS real-time vehicle feed
VEHICLE_URL = "https://realtime.ridemcts.com/gtfsrt/vehicles"


# Serve our website
@app.route("/")
def home():
    return send_from_directory(
        app.root_path,
        "index.html"
    )


# Return real-time bus information
@app.route("/api/buses")
def get_buses():
    try:
        response = requests.get(
            VEHICLE_URL,
            timeout=10
        )

        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        buses = []

        for entity in feed.entity:
            if not entity.HasField("vehicle"):
                continue

            vehicle = entity.vehicle

            if not vehicle.HasField("position"):
                continue

            if not vehicle.HasField("trip"):
                continue

            if not vehicle.trip.route_id:
                continue

            position = vehicle.position

            # GTFS speed is measured in meters/second.
            # Convert to kilometers/hour when provided.
            speed_kmh = None

            if position.HasField("speed"):
                speed_kmh = round(
                    position.speed * 3.6,
                    1
                )

            # Bearing: 0 = North, 90 = East,
            # 180 = South, 270 = West.
            direction = None

            if position.HasField("bearing"):
                direction = round(
                    position.bearing,
                    1
                )

            bus_info = {
                "bus_id": vehicle.vehicle.id,
                "route": vehicle.trip.route_id,
                "latitude": position.latitude,
                "longitude": position.longitude,
                "speed_kmh": speed_kmh,
                "direction_degrees": direction
            }

            buses.append(bus_info)

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


# Run the development server
if __name__ == "__main__":
    print("Starting AYOWhereMyBus...")
    print("Open http://127.0.0.1:5000")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
