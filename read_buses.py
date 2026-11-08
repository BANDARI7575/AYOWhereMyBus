
import json

# Step 1: Load saved bus data
with open("buses.json", "r") as file:
    data = json.load(file)

print("Welcome to AYOWhereMyBus!")
print("Total buses:", data["total_buses"])
print("Last updated:", data["last_updated"])

# Step 2: Keep searching until the user exits
while True:
    print("\n----------------------")

    route_number = input(
        "Enter bus route (or type exit): "
    ).strip()

    # Step 3: Exit the program
    if route_number.lower() == "exit":
        print("Thank you for using AYOWhereMyBus!")
        break

    # Step 4: Search for matching buses
    matching_buses = []

    for bus in data["buses"]:
        if bus["route"].upper() == route_number.upper():
            matching_buses.append(bus)

    # Step 5: Display results
    if len(matching_buses) > 0:
        print("Route:", route_number)
        print("Buses found:", len(matching_buses))

        for bus in matching_buses:
            print("----------------------")
            print("Bus ID:", bus["bus_id"])
            print("Latitude:", bus["latitude"])
            print("Longitude:", bus["longitude"])
    else:
        print("No buses found for route:", route_number)
