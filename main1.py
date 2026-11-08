print('Welcome to AYOWhereMybus!')
print('My bus is coming')
bus_number = 33
print(f"{bus_number}")
bus_number = 19
destination = "Airport"
status = "On Time"
arrival_minutes = 4
print(f"Bus {bus_number} will arrive in {arrival_minutes} minutes")
arrival_minutes = 4
print(f"Bus {bus_number} will arive in {arrival_minutes} minutes") 
arrival_minutes = 3
print(f"Bus {bus_number} will arive in {arrival_minutes} minutes") 
arrival_minutes = arrival_minutes-1
print(f"Bus {bus_number} will arive in {arrival_minutes} minutes") 
arrival_minutes = 6
arrival_minutes -= arrival_minutes-1
print(f"Bus {bus_number} will arive in {arrival_minutes} minutes") 

arrival_minutes = 5
if arrival_minutes == 5:
    print("Bus is 5 minutes away")

arrival_minutes = 0
if arrival_minutes == 0:
    print("Bus has arrived!")
else :
    print("Bus is coming")

arrival_minutes = 7
if arrival_minutes == 0:
    print("Bus has arrived!")
else :
    print("Bus is coming")
print("\n")
arrival_minutes = 1
if arrival_minutes == 0:
    print("Bus has arrived")
elif arrival_minutes == 1:
    print("Bus is almost here!")
else :
    print("Bus is coming")
    print("\n")

arrival_minutes = 8
if arrival_minutes > 5:
 print("Bus is far away!")
else:
 print("Bus is nearby!")