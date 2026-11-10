"""Indexed GTFS schedule, with agency-local service days and extended hours."""
import csv
import time
import math
import tempfile
import re
from functools import lru_cache
import os
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from stops_service import distance_km

TZ = ZoneInfo('America/Chicago')
ROOT = Path(__file__).parent
MIN_TRANSFER_SECONDS = 180  # AYO planning buffer, not an MCTS guarantee.

def service_epoch(day, value):
    """GTFS times measure seconds from local noon minus twelve hours (DST safe)."""
    noon=datetime.combine(day,datetime.min.time(),TZ).replace(hour=12)
    return int(noon.timestamp()-43200+seconds(value))

def seconds(value):
    h,m,s = map(int,value.split(':'))
    if h < 0 or not 0 <= m < 60 or not 0 <= s < 60: raise ValueError('Invalid GTFS time')
    return h*3600+m*60+s

class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try: return super().__exit__(*args)
        finally: self.close()

class Schedule:
    def __init__(self, source=None, database=None):
        self.source=Path(source or os.getenv('GTFS_DIR',ROOT/'google_transit'))
        self.database=str(database or os.getenv('SCHEDULE_DB',ROOT/'instance/schedule.sqlite'))
    def connect(self, readonly=True):
        # Requests must never create an empty schedule database on a bad path.
        c=sqlite3.connect(Path(self.database).resolve().as_uri()+('?mode=ro' if readonly else '?mode=rwc'), uri=True, factory=ClosingConnection); c.row_factory=sqlite3.Row; return c
    def build(self):
        """Build beside the active index, then replace only a successful candidate."""
        target=Path(self.database)
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, suffix='.sqlite',delete=False) as f:
            candidate=Path(f.name)
        try:
            Schedule(self.source,candidate)._build_into()
            os.replace(candidate,target)
            self.services.cache_clear()
        finally:
            candidate.unlink(missing_ok=True)
    def _build_into(self):
        self.services.cache_clear()
        Path(self.database).parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(self.database, factory=ClosingConnection) as c:
            for name in ['stops','routes','trips','stop_times','calendar','calendar_dates','shapes','transfers','frequencies']:
                path=self.source/(name+'.txt')
                if not path.exists():
                    c.execute('DROP TABLE IF EXISTS '+name)
                    continue
                with path.open(encoding='utf-8-sig',newline='') as f:
                    reader=csv.DictReader(f); fields=reader.fieldnames
                    if not fields or any(not re.fullmatch('[a-z][a-z0-9_]*', x) for x in fields):
                        raise ValueError('Invalid GTFS header in '+name)
                    c.execute('DROP TABLE IF EXISTS '+name)
                    c.execute('CREATE TABLE '+name+' ('+','.join('"'+x+'" TEXT' for x in fields)+')')
                    c.executemany('INSERT INTO '+name+' VALUES ('+','.join('?' for _ in fields)+')',([r[x] for x in fields] for r in reader))
            c.execute('CREATE TABLE IF NOT EXISTS calendar_dates(service_id TEXT,date TEXT,exception_type TEXT)')
            c.execute('CREATE TABLE IF NOT EXISTS shapes(shape_id TEXT,shape_pt_lat TEXT,shape_pt_lon TEXT,shape_pt_sequence TEXT)')
            c.execute('CREATE TABLE IF NOT EXISTS transfers(from_stop_id TEXT,to_stop_id TEXT,transfer_type TEXT,min_transfer_time TEXT)')
            c.execute('CREATE TABLE IF NOT EXISTS frequencies(trip_id TEXT)')
            c.executescript('CREATE INDEX IF NOT EXISTS times_stop ON stop_times(stop_id); CREATE INDEX IF NOT EXISTS times_trip ON stop_times(trip_id); CREATE INDEX IF NOT EXISTS trips_id ON trips(trip_id); CREATE INDEX IF NOT EXISTS dates_day ON calendar_dates(date); CREATE INDEX IF NOT EXISTS shape_id ON shapes(shape_id);')
            for table in ['stops','trips','stop_times','routes']:
                if not c.execute('SELECT 1 FROM '+table+' LIMIT 1').fetchone(): raise ValueError('Empty GTFS '+table)
    @lru_cache(maxsize=16)
    def services(self, day):
        with self.connect() as c:
            active=set()
            if c.execute("SELECT 1 FROM sqlite_master WHERE name='calendar'").fetchone():
                weekday=day.strftime('%A').lower()
                active={r['service_id'] for r in c.execute(f'SELECT service_id FROM calendar WHERE start_date<=? AND end_date>=? AND {weekday}=\'1\'',(day.strftime('%Y%m%d'),)*2)}
            for r in c.execute('SELECT * FROM calendar_dates WHERE date=?',(day.strftime('%Y%m%d'),)):
                if r['exception_type']=='1': active.add(r['service_id'])
                else: active.discard(r['service_id'])
            return active
    def departures(self, stop, now=None, horizon=7200):
        now=(now or datetime.now(TZ)).astimezone(TZ); output=[]
        with self.connect() as c:
            rows=c.execute('SELECT s.*,t.route_id,t.service_id,t.trip_headsign,t.direction_id,t.shape_id,COALESCE(NULLIF(r.route_short_name,\'\'),t.route_id) AS route_number FROM stop_times s JOIN trips t USING(trip_id) LEFT JOIN routes r ON r.route_id=t.route_id WHERE stop_id=? AND NOT EXISTS(SELECT 1 FROM frequencies f WHERE f.trip_id=t.trip_id)',(stop,)).fetchall()
        for offset in [-1,0,1]:
            day=now.date()+timedelta(days=offset); active=self.services(day)
            midnight=datetime.combine(day,datetime.min.time(),TZ)
            for r in rows:
                if r['service_id'] not in active or ('pickup_type' in r.keys() and r['pickup_type'] not in ('','0')): continue
                try: at=datetime.fromtimestamp(service_epoch(day,r['departure_time']),TZ)
                except ValueError: continue
                delta=at.timestamp()-now.timestamp()
                if 0 <= delta <= horizon:
                    output.append({**dict(r),'service_date':day.strftime('%Y%m%d'),'scheduled_at':at.isoformat(),'scheduled_epoch':int(at.timestamp()),'data_type':'scheduled','prediction_at':None})
        return sorted(output,key=lambda x:x['scheduled_epoch'])
    def stops(self, query=''):
        with self.connect() as c:
            return [dict(r) for r in c.execute('SELECT stop_id,stop_name,stop_lat,stop_lon FROM stops WHERE stop_name LIKE ? OR stop_id=? LIMIT 50',('%'+query+'%',query))]
    def shape(self, route):
        with self.connect() as c:
            ids=[r[0] for r in c.execute('SELECT DISTINCT shape_id FROM trips WHERE route_id=?',(route,))]
            return [[[float(r[0]),float(r[1])] for r in c.execute('SELECT shape_pt_lat,shape_pt_lon FROM shapes WHERE shape_id=? ORDER BY CAST(shape_pt_sequence AS INTEGER)',(s,))] for s in ids]
    def locations(self, query='', latitude=None, longitude=None):
        """Suggest only official boarding stops; no address/geocoding guesses."""
        with self.connect() as c:
            rows = [dict(r) for r in c.execute('SELECT * FROM stops')]
        rows = [r for r in rows if r.get('location_type', '') in ('', '0')]
        if latitude is not None:
            if not (math.isfinite(latitude) and math.isfinite(longitude)
                    and -90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError('Invalid location coordinates')
            for row in rows:
                row['distance_meters'] = round(distance_km(
                    latitude, longitude, float(row['stop_lat']), float(row['stop_lon'])) * 1000)
            rows = sorted((r for r in rows if r['distance_meters'] <= 1500),
                          key=lambda r: (r['distance_meters'], r['stop_id']))
        else:
            words = query.casefold().split()
            rows = [r for r in rows if all(word in r['stop_name'].casefold() for word in words)]
            rows.sort(key=lambda r: (not r['stop_name'].casefold().startswith(query.casefold()),
                                     r['stop_name'], r['stop_id']))
        with self.connect() as c:
            return [{'stop_id': r['stop_id'], 'name': r['stop_name'],
                     'latitude': float(r['stop_lat']), 'longitude': float(r['stop_lon']),
                     'description': r.get('stop_desc', ''),
                     'scheduled_directions': self.stop_directions(c,r['stop_id']),
                     'distance_meters': r.get('distance_meters')} for r in rows[:10]]

    def stop_directions(self,c,stop_id):
        return [dict(r) for r in c.execute("SELECT DISTINCT COALESCE(NULLIF(r.route_short_name,''),t.route_id) AS route_number,t.trip_headsign AS headsign,t.direction_id FROM stop_times st JOIN trips t USING(trip_id) JOIN routes r ON r.route_id=t.route_id WHERE st.stop_id=? ORDER BY route_number,headsign LIMIT 6",(stop_id,))]

    def itinerary(self, origin, destination, now=None, allow_walks=True, choice=0):
        """Present the existing scheduled search with verified names and trip geometry."""
        if not origin or not destination or len(origin) > 128 or len(destination) > 128:
            raise ValueError('Choose an origin and destination from the suggestions')
        if origin == destination:
            raise ValueError('Choose different origin and destination stops')
        now = now or datetime.now(TZ)
        result = self.plan(origin, destination, now, allow_walks=allow_walks,choice=choice)
        with self.connect() as c:
            def stop_info(stop_id):
                r = c.execute('SELECT * FROM stops WHERE stop_id=?', (stop_id,)).fetchone()
                return {'stop_id': stop_id, 'name': r['stop_name'],
                        'latitude': float(r['stop_lat']), 'longitude': float(r['stop_lon'])}
            for leg in result['legs']:
                leg['from_stop'] = stop_info(leg['from'])
                leg['to_stop'] = stop_info(leg['to'])
                if leg['type'] == 'bus':
                    r = c.execute('SELECT * FROM routes WHERE route_id=?', (leg['route'],)).fetchone()
                    leg['route_number'] = (r['route_short_name'] or leg['route']) if r else leg['route']
                    leg['route_name'] = r['route_long_name'] if r else ''
                    leg['geometry'] = [[float(r[0]), float(r[1])] for r in c.execute(
                        'SELECT shape_pt_lat,shape_pt_lon FROM shapes WHERE shape_id=? '
                        'ORDER BY CAST(shape_pt_sequence AS INTEGER)', (leg['shape_id'],))]
                    leg['geometry_scope'] = 'full_scheduled_trip'
                    if leg.get('from_sequence') is not None:
                        endpoint_rows=c.execute('SELECT * FROM stop_times WHERE trip_id=? AND CAST(stop_sequence AS INTEGER) IN (?,?) ORDER BY CAST(stop_sequence AS INTEGER)',(leg['trip_id'],leg['from_sequence'],leg['to_sequence'])).fetchall()
                        points=c.execute('SELECT * FROM shapes WHERE shape_id=? ORDER BY CAST(shape_pt_sequence AS INTEGER)',(leg['shape_id'],)).fetchall()
                        try:
                            lo,hi=[float(r['shape_dist_traveled']) for r in endpoint_rows]
                            distances=[float(r['shape_dist_traveled']) for r in points]
                            if hi>lo and distances==sorted(distances):
                                import bisect
                                start=max(0,bisect.bisect_right(distances,lo)-1)
                                end=min(len(points),bisect.bisect_left(distances,hi)+1)
                                if end-start>=2:
                                    leg['geometry']=[[float(r['shape_pt_lat']),float(r['shape_pt_lon'])] for r in points[start:end]]
                                    leg['geometry_scope']='scheduled_ride_segment'
                        except (ValueError,TypeError,KeyError,IndexError):
                            pass  # Keep explicitly labeled full-trip source geometry.
                else:
                    leg['estimated'] = True
                    leg['geometry'] = []  # No pedestrian routing source: never invent a path.
                leg['duration_seconds'] = leg['arrival'] - leg['departure']
            origin_info, destination_info = stop_info(origin), stop_info(destination)
            def nearby_platforms(selected):
                options=[]
                for row in c.execute('SELECT * FROM stops'):
                    if row['stop_id']==selected['stop_id'] or dict(row).get('location_type','') not in ('','0'):continue
                    distance=distance_km(selected['latitude'],selected['longitude'],float(row['stop_lat']),float(row['stop_lon']))*1000
                    if distance<=200:
                        options.append({**stop_info(row['stop_id']),'distance_meters':round(distance),'scheduled_directions':self.stop_directions(c,row['stop_id'])})
                return sorted(options,key=lambda r:r['distance_meters'])[:4]
            nearby_destinations=nearby_platforms(destination_info) if result.get('nearby_trip') or not result['legs'] else []
            nearby_origins=nearby_platforms(origin_info) if not result['legs'] else []
        legs = result['legs']
        departure = legs[0]['departure'] if legs else None
        rides = sum(leg['type'] == 'bus' for leg in legs)
        previous_bus = None
        for index, leg in enumerate(legs):
            if leg['type'] != 'bus': continue
            if previous_bus:
                margin = leg['departure'] - legs[index-1]['arrival']
                leg['transfer_margin_seconds'] = margin
                leg['connection_risk'] = 'tight' if margin < 300 else 'scheduled_only'
            previous_bus = leg
        return {**result, 'status': 'ok' if legs else 'no_route', 'timezone': str(TZ),
                'requested_at': int(now.timestamp()), 'departure': departure,
                'valid_until': (min(departure,int(now.timestamp())+300) if rides else int(now.timestamp())+300) if legs else None,
                'minimum_transfer_seconds': MIN_TRANSFER_SECONDS,'estimated_walks_allowed':allow_walks,
                'duration_seconds': result['arrival'] - departure if legs else None,
                'initial_wait_seconds': departure - int(now.timestamp()) if legs else None,
                'transfers': max(0, rides - 1),
                'walking_estimated': any(leg['type'] == 'walk' for leg in legs),
                'origin': origin_info, 'destination': destination_info, 'nearby_destination_stops':nearby_destinations,'nearby_origin_stops':nearby_origins}
    def plan(self, origin, destination, now=None, allow_walks=True,choice=0):
        """Bounded two-ride search with distinct incoming-trip labels and quality scoring.

        Generalized arrival adds five minutes per transfer and half of estimated
        walking time. These are AYO preferences, never scheduled or predicted time.
        """
        now=now or datetime.now(TZ)
        deadline=time.monotonic()+8
        with self.connect() as c:
            stops={r['stop_id']:dict(r) for r in c.execute('SELECT * FROM stops')}
            if origin not in stops or destination not in stops: raise ValueError('Choose valid stop IDs')
            @lru_cache(maxsize=32768)
            def meters(a,b):
                return distance_km(float(stops[a]['stop_lat']),float(stops[a]['stop_lon']),float(stops[b]['stop_lat']),float(stops[b]['stop_lon']))*1000
            direct=meters(origin,destination)
            class Legs(list):
                pass
            def extend(legs,leg):
                path=Legs([*legs,leg]);rides=getattr(legs,'rides',0)
                path.rides=rides+(leg['type']=='bus')
                path.penalty=getattr(legs,'penalty',0)+(300 if leg['type']=='bus' and rides else 0)+((leg['arrival']-leg['departure'])*0.5 if leg['type']=='walk' else 0)+max(0,meters(leg['to'],destination)-meters(leg['from'],destination))*0.3
                path.distance=getattr(legs,'distance',0)+leg.get('distance_meters',leg.get('meters',0))
                path.signature=(leg['trip_id'],leg['to'],'bus') if leg['type']=='bus' else (*legs.signature[:2],'walk') if rides else ('walk',)
                return path
            def score(label):
                return label[0]+getattr(label[1],'penalty',0)
            def signature(legs):
                return getattr(legs,'signature',('walk',))
            def insert(store,sid,label):
                items=store.setdefault(sid,[])
                if len(items)==4 and score(label)>=score(items[-1]):return
                sig=signature(label[1])
                matching=next((l for l in items if signature(l[1])==sig),None)
                if matching and score(matching)<=score(label):return
                if matching:items.remove(matching)
                items.append(label);items.sort(key=score)
                del items[4:]  # Documented bounded search, not a global optimum.
            @lru_cache(maxsize=4096)
            def neighbors(sid):
                return [(tid,meters(sid,tid)) for tid in stops if tid!=sid and abs(float(stops[sid]['stop_lat'])-float(stops[tid]['stop_lat']))<=.004 and abs(float(stops[sid]['stop_lon'])-float(stops[tid]['stop_lon']))<=.006 and meters(sid,tid)<=400]
            def walk_from(store,sid,label,final=False):
                at,legs=label
                if legs and legs[-1]['type']=='walk':return
                choices=[(destination,meters(sid,destination))] if final and sid!=destination and meters(sid,destination)<=400 else [] if final else neighbors(sid)
                for tid,d in choices:
                    duration=max(120,math.ceil(d/1.1))
                    insert(store,tid,(int(at)+duration,extend(legs,{'type':'walk','from':sid,'to':tid,'meters':round(d),'departure':int(at),'arrival':int(at)+duration})))
            frontier={origin:[(now.timestamp(),[])]}
            if allow_walks:walk_from(frontier,origin,frontier[origin][0])
            candidates=list(frontier.get(destination,[]))
            @lru_cache(maxsize=4096)
            def stop_departures(sid):
                return self.departures(sid,now,8*3600)
            @lru_cache(maxsize=2048)
            def trip_rows(trip):
                return [dict(r) for r in c.execute('SELECT * FROM stop_times WHERE trip_id=? ORDER BY CAST(stop_sequence AS INTEGER)',(trip,))]
            excluded_detour=False
            for ride in range(2):
                next_round={}
                for sid,labels in frontier.items():
                    for at,legs in labels:
                        if time.monotonic()>deadline:raise ValueError('Journey search exceeded limits. Try closer stops or the official MCTS planner.')
                        previous_bus=next((l for l in reversed(legs) if l['type']=='bus'),None)
                        start=at+(MIN_TRANSFER_SECONDS if previous_bus else 0)
                        # Keep a per-stop bounded departure horizon. Labels from distinct
                        # incoming trips must not collapse before transfer selectors apply.
                        for dep in [d for d in stop_departures(sid) if start<=d['scheduled_epoch']<=start+7200][:100]:
                            if time.monotonic()>deadline:raise ValueError('Journey search exceeded limits. Try closer stops or the official MCTS planner.')
                            if previous_bus:
                                if dep['trip_id']==previous_bus['trip_id']:continue
                                rules=c.execute('SELECT * FROM transfers WHERE from_stop_id=? AND to_stop_id=?',(previous_bus['to'],sid)).fetchall()
                                selectors={'from_route_id':previous_bus['route'],'to_route_id':dep['route_id'],'from_trip_id':previous_bus['trip_id'],'to_trip_id':dep['trip_id']}
                                applicable=[dict(r) for r in rules if all(not dict(r).get(k) or dict(r)[k]==v for k,v in selectors.items())]
                                if any(r['transfer_type'] in ('3','4','5') for r in applicable):continue
                                minimum=max([MIN_TRANSFER_SECONDS]+[int(r.get('min_transfer_time') or 0) for r in applicable])
                                if dep['scheduled_epoch']-previous_bus['arrival']<minimum:continue
                            rows=[r for r in trip_rows(dep['trip_id']) if int(r['stop_sequence'])>int(dep['stop_sequence'])]
                            day=datetime.strptime(dep['service_date'],'%Y%m%d').date()
                            prior=sid;distance=0;retraced=False
                            reverse_same_route=bool(previous_bus and previous_bus['route']==dep['route_id'] and previous_bus.get('direction_id')!=dep['direction_id'] and previous_bus.get('distance_meters',0)>800)
                            visited={l['from'] for l in legs}|{l['to'] for l in legs}
                            for row in rows:
                                target=row['stop_id'];distance+=meters(prior,target);prior=target
                                if reverse_same_route and meters(target,previous_bus['from'])<=150:retraced=True
                                if retraced:
                                    excluded_detour=True
                                    continue
                                if 'drop_off_type' in row.keys() and row['drop_off_type'] not in ('','0'):continue
                                arrival=service_epoch(day,row['arrival_time'])
                                if arrival<dep['scheduled_epoch'] or target==origin or target in visited:continue
                                if direct<=800 and distance+getattr(legs,'distance',0)>max(1200,direct*4):
                                    excluded_detour=True
                                    continue
                                bus={'type':'bus','service_date':dep['service_date'],'route':dep['route_id'],'trip_id':dep['trip_id'],'shape_id':dep['shape_id'],'headsign':dep['trip_headsign'],'direction_id':dep['direction_id'],'from':sid,'to':target,'departure':dep['scheduled_epoch'],'arrival':int(arrival),'distance_meters':round(distance),'from_sequence':int(dep['stop_sequence']),'to_sequence':int(row['stop_sequence'])}
                                insert(next_round,target,(arrival,extend(legs,bus)))
                if allow_walks:
                    for sid,labels in list(next_round.items()):
                        for label in list(labels):walk_from(next_round,sid,label,final=ride==1)
                candidates.extend(next_round.get(destination,[]))
                frontier=next_round
            # A few blocks must not become a cross-town out-and-back. Retain the
            # explicit no-reasonable-route outcome and nearby platform suggestions.
            reasonable=[l for l in candidates if not (direct<=800 and sum(x.get('distance_meters',x.get('meters',0)) for x in l[1])>max(1200,direct*4))]
            options=[];seen=set()
            for candidate in sorted(reasonable,key=score):
                key=tuple((l['type'],l.get('trip_id'),l['from'],l['to'],l['departure']) for l in candidate[1])
                if key not in seen:options.append(candidate);seen.add(key)
                if len(options)==3:break
            if type(choice)!=int or choice<0 or choice>=max(1,len(options)):raise ValueError('Journey option no longer available; search again')
            result=options[choice] if options else None
            return {'data_type':'estimated_walk' if result and all(l['type']=='walk' for l in result[1]) else 'scheduled','legs':result[1] if result else [],'arrival':int(result[0]) if result else None,
                    'straight_line_distance_meters':round(direct),'nearby_trip':direct<=800,
                    'search_outcome':'reasonable_connection' if result else 'unreasonable_detour_excluded' if candidates or excluded_detour else 'no_connection',
                    'choices_available':len(options),'selected_choice':choice,
                    'selection_policy':'arrival_plus_transfer_walking_and_backtracking_penalties',
                    'limitations':'Up to one transfer; four incoming-trip labels per stop, 100 departures per boarding search and an eight-hour departure horizon. Same-route reverse transfers retracing the boarding area are excluded. Walking is straight-line, not a verified pedestrian or accessible path. Not exhaustive. Allow extra transfer time.'}
