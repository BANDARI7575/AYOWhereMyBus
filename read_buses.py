
import requests
from google.transit import gtfs_realtime_pb2

# Milwaukee MCTS live vehicle feed
vehicle_url = "https://realtime.ridemcts.com/gtfsrt/vehicles"

print("Welcome to AYOWhereMyBus!")

while True:
    print("\n----------------------")

    route_number = input(
        "Enter bus route (or type exit): "
    ).strip()

    if route_number.lower() == "exit":
        print("Thank you for using AYOWhereMyBus!")
        break

    if not route_number:
        print("Please enter a route number.")
        continue

    try:
        # Fetch fresh bus data
        response = requests.get(vehicle_url, timeout=10)
        response.raise_for_status()

        # Decode the GTFS feed
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        # Search for matching vehicles
        matching_buses = []

        for entity in feed.entity:
            if entity.HasField("vehicle"):
                bus = entity.vehicle

                if (
                    bus.HasField("position")
                    and bus.trip.route_id.upper()
                    == route_number.upper()
                ):
                    matching_buses.append(bus)

        # Display search results
        print("Status Code:", response.status_code)
        print("Route:", route_number)
        print("Buses found:", len(matching_buses))

        for bus in matching_buses:
            print("----------------------")
            print("Bus ID:", bus.vehicle.id)
            print("Latitude:", bus.position.latitude)
            print("Longitude:", bus.position.longitude)

        if not matching_buses:
            print("No matching vehicles in the current feed.")

    except requests.RequestException as error:
        print("Could not retrieve bus data:", error)

    except Exception as error:
        print("Could not process bus data:", error)
