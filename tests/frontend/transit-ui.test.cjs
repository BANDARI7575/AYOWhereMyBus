const {test}=require('node:test');const assert=require('node:assert/strict');const ui=require('../../static/transit-ui.js');
test('arrival presentation rejects stale, conflicting and uncertain predictions',()=>{
 const d={data_type:'realtime',prediction_kind:'arrival',prediction_at:1200,prediction_reported_at:990,scheduled_epoch:1300};
 assert.deepEqual(ui.departureState(d,'fresh',1000),{kind:'arrival',epoch:1200});
 for(const changed of [{prediction_reported_at:1},{prediction_reported_at:1100},{prediction_at:900},{uncertainty_seconds:-1},{uncertainty_seconds:121},{uncertainty_seconds:NaN},{data_type:'scheduled'}])assert.deepEqual(ui.departureState({...d,...changed},'fresh',1000),{kind:'scheduled',epoch:1300});
 assert.equal(ui.departureState(d,'stale_or_invalid',1000).kind,'scheduled');
 assert.equal(ui.departureState({...d,canceled:true},'fresh',1000).kind,'canceled');
 assert.deepEqual(ui.departureState({},'fresh',1000),{kind:'unknown',epoch:null});
});
test('alert timing preserves ongoing, upcoming and open-ended notices',()=>{
 assert.equal(ui.alertTiming([{start:1}],1000),'ongoing');
 assert.equal(ui.alertTiming([{start:2000}],1000),'upcoming');
 assert.equal(ui.alertTiming([{end:900}],1000),'expired');
 assert.equal(ui.alertTiming([{end:900},{}],1000),'ongoing');
 assert.equal(ui.alertTiming([],1000),'undated');
 assert.equal(ui.alertTiming([{}],1000),'undated');
});
test('alert IDs and affected routes deduplicate; unsafe source URLs are rejected',()=>{
 const a={id:'one',active_periods:[{start:1}],affected:[{route_id:'60'},{route_id:'60'},{route_id:'24'},{route_id:'24'},{route_id:'RR3'},{route_id:'RR3'}]};
 assert.deepEqual(ui.normalizeAlerts([a,a],'',1000)[0].routes,['60','24','RR3']);
 assert.equal(ui.normalizeAlerts([a,a],'',1000).length,1);
 assert.equal(ui.normalizeAlerts([a],'19',1000).length,0);
 assert.equal(ui.safeUrl('javascript:alert(1)'),null);assert.equal(ui.safeUrl('https://www.ridemcts.com/'),'https://www.ridemcts.com/');
});
test('place adapters are inactive and never receive a query without approval and consent',async()=>{
 const search=require('../../static/location-search.js');assert.equal(search.placesAvailable,false);
 await assert.rejects(search.searchPlaces('private address'),/approved provider/);
 assert.throws(()=>search.registerProvider({id:'test',search(){}}),/approved/);
 let calls=0;search.registerProvider({id:'isolated-test',approved:true,search:async()=>{calls++;return [{name:'Place',latitude:43,longitude:-88,stop_id:'invented'},{name:'Invalid',latitude:200,longitude:0}];}});
 await assert.rejects(search.searchPlaces('query'),/Consent/);assert.equal(calls,0);
 assert.deepEqual(await search.searchPlaces('query',{consent:true}),[{kind:'place',name:'Place',latitude:43,longitude:-88}]);
});
