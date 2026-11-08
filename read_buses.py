
import json

# Step 1: Open the saved bus data
with open("buses.json", "r") as file:
    data = json.load(file)

# Step 2: Show total buses
print("Total buses:", data["total_buses"])

# Step 3: Show when data was saved
print("Last updated:", data["last_updated"])

# Step 4: Display each bus
for bus in data["buses"]:
    print("----------------------")
    print("Bus ID:", bus["bus_id"])
    print("Route:", bus["route"])
    print("Latitude:", bus["latitude"])
    print("Longitude:", bus["longitude"])

print("----------------------")
print("Finished reading all buses!")
