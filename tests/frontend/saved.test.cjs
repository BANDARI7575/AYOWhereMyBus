const {test}=require('node:test'),assert=require('node:assert/strict');const {liveArrival}=require('../../static/js/saved.js');
const now=2000,dep={stop_id:'1',data_type:'realtime',prediction_at:2300,prediction_reported_at:1990,prediction_kind:'arrival',scheduled_epoch:2400};
test('saved ETA requires a fresh qualified prediction and correct stop; never substitute a schedule',()=>{
 const data={feed_timestamp:1990,realtime_status:'fresh',departures:[dep]};assert.equal(liveArrival(data,now,'1').p.epoch,2300);
 for(const source of [{...data,feed_timestamp:1000},{...data,realtime_status:'stale'}, {...data,departures:[{...dep,data_type:'scheduled'}]}, {...data,departures:[{...dep,canceled:true}]}, {...data,departures:[{...dep,prediction_reported_at:1000}]}, {...data,departures:[{...dep,uncertainty_seconds:999}]}])assert.equal(liveArrival(source,now,'1'),null);
 assert.equal(liveArrival(data,now,'2'),null);assert.equal(liveArrival(data,2400,'1'),null);
});
test('saved ETA sorts actual predictions rather than array or schedule order',()=>{
 const data={feed_timestamp:1990,realtime_status:'fresh',departures:[{...dep,prediction_at:2500,scheduled_epoch:2100},{...dep,prediction_at:2200,scheduled_epoch:2600}]};assert.equal(liveArrival(data,now,'1').p.epoch,2200);
});
