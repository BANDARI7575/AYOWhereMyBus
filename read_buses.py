
import json

# Step 1: Load saved bus data
with open("buses.json", "r") as file:
    data = json.load(file)

print("Total buses:", data["total_buses"])
print("Last updated:", data["last_updated"])

# Step 2: Ask the user for a route number
route_number = input("Enter bus route number: ").strip()

# Step 3: Search for matching buses
matching_buses = []

for bus in data["buses"]:
    if bus["route"].upper() == route_number.upper():
        matching_buses.append(bus)

# Step 4: Display search results
print("----------------------")

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
    print("Try another route or refresh the saved data.")
