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
        return [{'stop_id': r['stop_id'], 'name': r['stop_name'],
                 'latitude': float(r['stop_lat']), 'longitude': float(r['stop_lon']),
                 'description': r.get('stop_desc', ''),
                 'distance_meters': r.get('distance_meters')} for r in rows[:10]]

    def itinerary(self, origin, destination, now=None, allow_walks=True):
        """Present the existing scheduled search with verified names and trip geometry."""
        if not origin or not destination or len(origin) > 128 or len(destination) > 128:
            raise ValueError('Choose an origin and destination from the suggestions')
        if origin == destination:
            raise ValueError('Choose different origin and destination stops')
        now = now or datetime.now(TZ)
        result = self.plan(origin, destination, now, allow_walks=allow_walks)
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
                else:
                    leg['estimated'] = True
                    leg['geometry'] = []  # No pedestrian routing source: never invent a path.
                leg['duration_seconds'] = leg['arrival'] - leg['departure']
            origin_info, destination_info = stop_info(origin), stop_info(destination)
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
                'valid_until': min(departure, int(now.timestamp())+300) if legs else None,
                'minimum_transfer_seconds': MIN_TRANSFER_SECONDS,'estimated_walks_allowed':allow_walks,
                'duration_seconds': result['arrival'] - departure if legs else None,
                'initial_wait_seconds': departure - int(now.timestamp()) if legs else None,
                'transfers': max(0, rides - 1),
                'walking_estimated': any(leg['type'] == 'walk' for leg in legs),
                'origin': origin_info, 'destination': destination_info}
    def plan(self, origin, destination, now=None, allow_walks=True):
        """Bounded earliest-arrival search: up to two rides and 400m transfers."""
        now=now or datetime.now(TZ)
        deadline=time.monotonic()+8
        with self.connect() as c:
            stops={r['stop_id']:dict(r) for r in c.execute('SELECT * FROM stops')}
            if origin not in stops or destination not in stops: raise ValueError('Choose valid stop IDs')
            best={origin:(now.timestamp(),[])}; frontier={origin}
            for ride in range(2):
                # Keep each round tied to its previous labels: a later improvement
                # must not accidentally permit a third ride in the same round.
                previous = dict(best)
                next_frontier=set()
                for sid in frontier:
                    if time.monotonic()>deadline: raise ValueError("Journey search exceeded limits. Try closer stops or the official MCTS planner.")
                    start,legs=previous[sid]
                    if legs: start+=MIN_TRANSFER_SECONDS
                    for dep in self.departures(sid,datetime.fromtimestamp(start,TZ),7200)[:100]:
                        previous_bus = next((leg for leg in reversed(legs) if leg['type']=='bus'), None)
                        if previous_bus:
                            rules = c.execute('SELECT * FROM transfers WHERE from_stop_id=? AND to_stop_id=?', (previous_bus['to'],sid)).fetchall()
                            applicable=[]
                            for rule in rules:
                                rule=dict(rule)
                                selectors={'from_route_id':previous_bus['route'],'to_route_id':dep['route_id'], 'from_trip_id':previous_bus['trip_id'],'to_trip_id':dep['trip_id']}
                                if all(not rule.get(key) or rule[key]==value for key,value in selectors.items()): applicable.append(rule)
                            # Conservative: never offer forbidden or unsupported linked-trip rules.
                            if any(r['transfer_type'] in ('3','4','5') for r in applicable): continue
                            minimum=max([MIN_TRANSFER_SECONDS]+[int(r.get('min_transfer_time') or 0) for r in applicable])
                            if dep['scheduled_epoch']-previous_bus['arrival'] < minimum: continue
                        rows=c.execute('SELECT * FROM stop_times WHERE trip_id=? AND CAST(stop_sequence AS INTEGER)>? ORDER BY CAST(stop_sequence AS INTEGER)',(dep['trip_id'],int(dep['stop_sequence'])) )
                        midnight=datetime.strptime(dep['service_date'],'%Y%m%d').replace(tzinfo=TZ)
                        for row in rows:
                            if 'drop_off_type' in row.keys() and row['drop_off_type'] not in ('','0'): continue
                            at=service_epoch(midnight.date(),row['arrival_time']); target=row['stop_id']
                            if at < dep['scheduled_epoch']: continue
                            if target not in best or at<best[target][0]:
                                best[target]=(at,legs+[{'type':'bus','route':dep['route_id'],'trip_id':dep['trip_id'],'shape_id':dep['shape_id'],'headsign':dep['trip_headsign'],'from':sid,'to':target,'departure':dep['scheduled_epoch'],'arrival':int(at)}]); next_frontier.add(target)
                # Transfer walking estimates are straight-line, not accessible street routing.
                if not allow_walks:
                    frontier=next_frontier
                    continue
                walk_sources = [(sid, best[sid]) for sid in next_frontier]
                for sid, (at, legs) in walk_sources:
                    if time.monotonic() > deadline:
                        raise ValueError('Journey search exceeded limits. Try closer stops or the official MCTS planner.')
                    a=stops[sid]
                    for tid,b in stops.items():
                        if abs(float(a['stop_lat'])-float(b['stop_lat']))>.004 or abs(float(a['stop_lon'])-float(b['stop_lon']))>.006: continue
                        meters=distance_km(float(a['stop_lat']),float(a['stop_lon']),float(b['stop_lat']),float(b['stop_lon']))*1000
                        if tid!=sid and meters<=400:
                            arrival=at+max(120,meters/1.1)
                            if tid not in best or arrival<best[tid][0]:
                                best[tid]=(arrival,legs+[{'type':'walk','from':sid,'to':tid,'meters':round(meters),'departure':int(at),'arrival':int(arrival)}]); next_frontier.add(tid)
                frontier=next_frontier
            result=best.get(destination)
            return {'data_type':'scheduled','legs':result[1] if result else [],'arrival':int(result[0]) if result else None,'limitations':'Up to one transfer; walking is straight-line, not a verified pedestrian or accessible path. Not exhaustive. Allow extra transfer time.'}
