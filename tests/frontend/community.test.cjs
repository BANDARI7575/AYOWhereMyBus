const {test}=require('node:test'),assert=require('node:assert/strict');
const {payload}=require('../../static/js/community-reports.js');
test('community payload uses only a current nearby stop and verified category',()=>{
 const snapshot={available:true,stops:[{stop_id:'3665'}]},categories=[{id:'snow_ice'}];
 assert.deepEqual(payload('3665','snow_ice','',snapshot,categories),{stop_id:'3665',category:'snow_ice',comment:''});
 assert.deepEqual(payload('3665','snow_ice',' Nieve\n  aquí ',snapshot,categories).comment,'Nieve aquí');
 assert.throws(()=>payload('bad','snow_ice','',snapshot,categories));
 assert.throws(()=>payload('3665','unknown','',snapshot,categories));
 assert.throws(()=>payload('3665','snow_ice','',{...snapshot,available:false},categories));
 assert.throws(()=>payload('3665','snow_ice','x'.repeat(501),snapshot,categories));
});
