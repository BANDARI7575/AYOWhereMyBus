const {test}=require('node:test'),assert=require('node:assert/strict');
const {selection,localReports}=require('../../static/js/alerts-appearance.js');
test('nearby summary validates shared coordinates and preserves the Home radius',()=>{
 assert.equal(selection(null),null);
 for(const point of [{latitude:NaN,longitude:0},{latitude:91,longitude:0},{latitude:0,longitude:181}])assert.equal(selection(point),null);
 assert.equal(selection({latitude:43,longitude:-88},.1).radius,.1);
 assert.equal(selection({latitude:43,longitude:-88},3).radius,3);
 assert.equal(selection({latitude:43,longitude:-88},4),null);
 assert.notEqual(selection({latitude:43,longitude:-88},.5).key,selection({latitude:43,longitude:-88},1).key);
});
test('community observations match nearby stop IDs and expire at the 24-hour boundary',()=>{
 const now=100000,report={id:1,stop_id:'1',text:'Isolated observation',created:now-86399,expires:now+1};
 assert.deepEqual(localReports([report],[{stop_id:'1'}],now),[report]);
 assert.deepEqual(localReports([report],[{stop_id:'1'}],now+1),[]);
 assert.deepEqual(localReports([{...report,expires:now+86400}],[{stop_id:'1'}],now+1),[],'a malformed expiry must not extend an observation beyond 24 hours');
 for(const invalid of [{...report,stop_id:'2'},{...report,state:'pending'},{...report,state:'rejected'},{...report,expires:null},{...report,created:null},{...report,created:now+120},{...report,text:null}])assert.deepEqual(localReports([invalid],[{stop_id:'1'}],now),[]);
});
