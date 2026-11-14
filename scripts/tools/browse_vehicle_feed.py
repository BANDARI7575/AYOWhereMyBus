
import requests
from google.transit import gtfs_realtime_pb2

# Milwaukee MCTS live bus tracking URL
vehicle_url = "https://realtime.ridemcts.com/gtfsrt/vehicles"

print("Welcome to AYOWhereMyBus!")

while True:
    print("\n----------------------")

    # Ask the user for a bus route
    route_number = input(
        "Enter bus route (or type exit): "
    ).strip()

    # Exit the program
    if route_number.lower() == "exit":
        print("Thank you for using AYOWhereMyBus!")
        break

    # Check for empty input
    if not route_number:
        print("Please enter a route number.")
        continue

    try:
        # Step 1: Get fresh Milwaukee bus data
        response = requests.get(vehicle_url, timeout=10)
        response.raise_for_status()

        # Step 2: Decode the GTFS real-time feed
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        # Step 3: Find buses on the selected route
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

        # Step 4: Display the results
        print("Status Code:", response.status_code)
        print("Route:", route_number)
        print("Buses found:", len(matching_buses))

        # Step 5: Generate Google Maps links
        for bus in matching_buses:
            latitude = bus.position.latitude
            longitude = bus.position.longitude

            maps_link = (
                f"https://www.google.com/maps/search/"
                f"?api=1&query={latitude}%2C{longitude}"
            )

            print("----------------------")
            print("Bus ID:", bus.vehicle.id)
            print("Latitude:", latitude)
            print("Longitude:", longitude)
            print("Google Maps:", maps_link)

        if not matching_buses:
            print("No matching vehicles in the current feed.")

    except requests.RequestException as error:
        print("Could not retrieve bus data:", error)

    except Exception as error:
        print("Could not process bus data:", error)
