"""Indexed stop-specific scheduled routes and destinations."""
from transit_engine import Schedule

def routes_for_stop(stop_id):
    with Schedule().connect() as c:
        rows=c.execute('''SELECT DISTINCT r.route_id,r.route_short_name,r.route_long_name,t.direction_id,t.trip_headsign
            FROM stop_times s JOIN trips t USING(trip_id) JOIN routes r ON r.route_id=t.route_id WHERE s.stop_id=?''',(str(stop_id),)).fetchall()
    result={}
    for r in rows:
        item=result.setdefault(r['route_id'],{'route_id':r['route_id'],'route_number':r['route_short_name'] or r['route_id'],'route_name':r['route_long_name'],'destinations':[]})
        item['destinations'].append({'direction_id':r['direction_id'],'headsign':r['trip_headsign']})
    return sorted(result.values(),key=lambda r:r['route_number'])
