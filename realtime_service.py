"""Fail-closed GTFS-RT adapters. Vehicle positions never produce predictions."""
import os
import time
import threading
import requests
from feed_http import fetch_feed
from google.transit import gtfs_realtime_pb2 as pb

class Realtime:
    def __init__(self): self.cache={}; self.locks={kind:threading.Lock() for kind in ['alerts','updates']}
    def feed(self, kind):
        url=os.getenv({'alerts':'ALERTS_URL','updates':'TRIP_UPDATES_URL'}[kind], 'https://realtime.ridemcts.com/gtfsrt/alerts' if kind=='alerts' else 'https://realtime.ridemcts.com/gtfsrt/trips')
        if not url: return None,'unconfigured'
        with self.locks[kind]:
            cached=self.cache.get(kind)
            if cached and time.monotonic()-cached[0]<20:
                f,status=cached[1],cached[2]
                if status=='fresh' and not -60<=time.time()-f.header.timestamp<=180: status='stale_or_invalid'
                return f,status
            try:
                raw=fetch_feed(url)
                f=pb.FeedMessage(); f.ParseFromString(raw)
                age=time.time()-f.header.timestamp
                status='fresh' if f.IsInitialized() and f.header.timestamp and -60<=age<=180 and f.header.incrementality==0 else 'stale_or_invalid'
                self.cache[kind]=(time.monotonic(),f,status)
                return f,status
            except Exception:
                self.cache[kind]=(time.monotonic(),None,'unavailable'); return None,'unavailable'
    def apply(self, departures):
        feed,status=self.feed('updates')
        if status!='fresh': return departures,status
        updates={}
        for e in feed.entity:
            if e.HasField('trip_update') and not e.is_deleted:
                u=e.trip_update
                updates[(u.trip.trip_id,u.trip.start_date)]=u
        result=[]
        for d in departures:
            u=updates.get((d['trip_id'],d['service_date']))
            if u is None: u=updates.get((d['trip_id'],''))
            if u and (not u.timestamp or not -60<=time.time()-u.timestamp<=180): u=None
            if u and u.trip.route_id and u.trip.route_id!=d.get('route_id',u.trip.route_id): u=None
            if u and u.trip.start_date==d['service_date'] and u.trip.schedule_relationship==pb.TripDescriptor.CANCELED:
                d={**d,'canceled':True}; result.append(d); continue
            if u and u.trip.schedule_relationship not in (pb.TripDescriptor.SCHEDULED,pb.TripDescriptor.CANCELED): u=None
            if u and u.trip.schedule_relationship==pb.TripDescriptor.CANCELED:
                d={**d,'realtime_warning':'Trip cancellation reported without a verified service date. Check official alerts.'}; u=None
            if u:
                for s in u.stop_time_update:
                    if (not s.stop_id or s.stop_id==d['stop_id']) and (not s.HasField('stop_sequence') or s.stop_sequence==int(d['stop_sequence'])) and (s.stop_id or s.HasField('stop_sequence')):
                        if s.schedule_relationship==pb.TripUpdate.StopTimeUpdate.SKIPPED:
                            if u.trip.start_date==d['service_date']: d={**d,'canceled':True}
                            break
                        if s.schedule_relationship!=pb.TripUpdate.StopTimeUpdate.SCHEDULED: break
                        is_departure=s.HasField('departure') and s.departure.HasField('time')
                        event=s.departure if is_departure else s.arrival
                        # MCTS omits start_date. Bind absolute stop events to a nearby
                        # scheduled occurrence; never infer cancellations without a date.
                        if event.HasField('time') and -60 <= event.time-time.time() <= 21600 and (not d.get('scheduled_epoch') or abs(event.time-d['scheduled_epoch'])<=21600):
                            d={**d,'prediction_at':int(event.time),'prediction_reported_at':int(u.timestamp),'prediction_kind':'departure' if is_departure else 'arrival','data_type':'realtime','uncertainty_seconds':event.uncertainty if event.HasField('uncertainty') else None}
                        break
            result.append(d)
        return result,status
    def alerts(self):
        f,status=self.feed('alerts'); output=[]; now=time.time()
        if status=='fresh':
            for e in f.entity:
                if not e.HasField('alert') or e.is_deleted: continue
                a=e.alert
                if a.active_period and not any((not p.HasField('start') or p.start<=now) and (not p.HasField('end') or now<p.end) for p in a.active_period): continue
                output.append({'active_periods':[{'start':p.start if p.HasField('start') else None,'end':p.end if p.HasField('end') else None} for p in a.active_period],'id':e.id,'header':[{'language':t.language,'text':t.text} for t in a.header_text.translation], 'description':[{'language':t.language,'text':t.text} for t in a.description_text.translation], 'affected':[{'route_id':s.route_id,'stop_id':s.stop_id} for s in a.informed_entity]})
        return {'status':status,'alerts':output,'feed_timestamp':int(f.header.timestamp) if f else None,'retrieved_at':int(now),'source':'MCTS GTFS-Realtime'}
