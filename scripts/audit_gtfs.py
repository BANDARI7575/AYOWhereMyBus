"""Read-only integrity scan of the imported schedule. Outputs counts, never rider data."""
import json
import sys
import math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.transit_engine import Schedule,seconds
s=Schedule();r={}
with s.connect() as c:
    r['counts']={t:c.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in ['stops','routes','trips','stop_times','shapes','transfers','frequencies']}
    r['orphan_stop_times']=c.execute('SELECT COUNT(*) FROM stop_times s LEFT JOIN trips t USING(trip_id) WHERE t.trip_id IS NULL').fetchone()[0]
    r['orphan_stops']=c.execute('SELECT COUNT(*) FROM stop_times s LEFT JOIN stops t USING(stop_id) WHERE t.stop_id IS NULL').fetchone()[0]
    r['invalid_stop_coordinates']=sum(not (math.isfinite(float(x['stop_lat'])) and math.isfinite(float(x['stop_lon'])) and -90<=float(x['stop_lat'])<=90 and -180<=float(x['stop_lon'])<=180) for x in c.execute('SELECT stop_lat,stop_lon FROM stops'))
    r['invalid_shape_coordinates']=sum(not (math.isfinite(float(x[0])) and math.isfinite(float(x[1])) and -90<=float(x[0])<=90 and -180<=float(x[1])<=180) for x in c.execute('SELECT shape_pt_lat,shape_pt_lon FROM shapes'))
    r['orphan_trip_routes']=c.execute('SELECT COUNT(*) FROM trips t LEFT JOIN routes r USING(route_id) WHERE r.route_id IS NULL').fetchone()[0]
    r['conflicting_calendar_dates']=c.execute('SELECT COUNT(*) FROM (SELECT service_id,date FROM calendar_dates GROUP BY service_id,date HAVING COUNT(*)>1)').fetchone()[0]
    r['invalid_times']=0;r['backward_times']=0;last_trip=None;last_time=None
    for row in c.execute('SELECT trip_id,arrival_time,departure_time FROM stop_times ORDER BY trip_id,CAST(stop_sequence AS INTEGER)'):
        try:a,d=seconds(row['arrival_time']),seconds(row['departure_time'])
        except (ValueError,TypeError):r['invalid_times']+=1;continue
        if d<a or (row['trip_id']==last_trip and a<last_time):r['backward_times']+=1
        last_trip,last_time=row['trip_id'],d
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(r,indent=2))
print(json.dumps(r,indent=2))
if any(r[k] for k in ['orphan_stop_times','orphan_stops','invalid_stop_coordinates','invalid_times','backward_times','invalid_shape_coordinates','orphan_trip_routes','conflicting_calendar_dates']):sys.exit(1)
