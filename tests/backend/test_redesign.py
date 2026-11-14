"""Redesign retains GTFS-RT safety and never discards open-ended alerts."""
import time,unittest
from unittest.mock import patch
from google.transit import gtfs_realtime_pb2 as pb
from backend.realtime_service import Realtime

class AlertPresentationContract(unittest.TestCase):
    def test_upcoming_and_old_ongoing_alerts_survive_but_truly_expired_do_not(self):
        now=int(time.time());feed=pb.FeedMessage();feed.header.gtfs_realtime_version='2.0';feed.header.timestamp=now
        for name,start,end in [('ongoing',now-100000,None),('upcoming',now+3600,now+7200),('expired',now-200,now-100),('undated',None,None)]:
            e=feed.entity.add(id=name);a=e.alert
            a.header_text.translation.add(language='en',text=name)
            a.url.translation.add(language='en',text='https://www.ridemcts.com/')
            if start is not None or end is not None:
                period=a.active_period.add()
                if start is not None:period.start=start
                if end is not None:period.end=end
        rt=Realtime()
        with patch.object(rt,'feed',return_value=(feed,'fresh')):result=rt.alerts()
        self.assertEqual({a['id'] for a in result['alerts']},{'ongoing','upcoming','undated'})
        self.assertEqual(result['alerts'][0]['url'][0]['text'],'https://www.ridemcts.com/')
