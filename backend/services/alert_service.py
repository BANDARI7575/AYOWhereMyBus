"""One route-membership definition for all official alert consumers."""
from copy import deepcopy


def snapshot(realtime, schedule):
    data = deepcopy(realtime.alerts())
    stop_ids = {x.get('stop_id') for a in data.get('alerts', [])
                for x in a.get('affected', []) if x.get('stop_id')}
    routes_by_stop = {}
    if stop_ids:
        with schedule.connect() as c:
            for sid in stop_ids:
                routes_by_stop[sid] = {r[0] for r in c.execute(
                    'SELECT DISTINCT t.route_id FROM stop_times st JOIN trips t USING(trip_id) WHERE st.stop_id=?', (sid,))}
    for alert in data.get('alerts', []):
        routes = set()
        for affected in alert.get('affected', []):
            if affected.get('route_id'): routes.add(affected['route_id'])
            routes.update(routes_by_stop.get(affected.get('stop_id'), set()))
        alert['relevant_routes'] = sorted(routes)
        alert['systemwide'] = not any(x.get('route_id') or x.get('stop_id') for x in alert.get('affected', []))
    return data


def filter_route(data, route):
    if not route: return data
    return {**data, 'route_filter_applied': route, 'alerts': [a for a in data.get('alerts', [])
            if a.get('systemwide') or route.upper() in {r.upper() for r in a.get('relevant_routes', [])}]}
