const {test} = require('node:test');
const assert = require('node:assert/strict');
const {duration, timeLabel, walkingLink} = require('../static/journey.js');
test('durations include fractional minutes without negative output', () => {
  assert.equal(duration(1500), '25 min');
  assert.equal(duration(121), '3 min');
  assert.equal(duration(-1), '0 min');
});
test('scheduled labels retain Chicago calendar date after midnight', () => {
  const label = timeLabel(Date.parse('2026-11-10T06:10:00Z') / 1000);
  assert.match(label, /Nov 10/); assert.match(label, /12:10/);
});
test('Spanish date labels are available', () => {
  const label = timeLabel(Date.parse('2026-11-10T06:10:00Z') / 1000, true);
  assert.match(label, /nov/); assert.match(label, /12:10/);
});
test('external walking link uses only verified stop coordinates', () => {
  assert.equal(walkingLink({from_stop:{latitude:43,longitude:-88},to_stop:{latitude:43.01,longitude:-88}}),
    'https://www.google.com/maps/dir/?api=1&origin=43,-88&destination=43.01,-88&travelmode=walking');
});
test('missing local API reports a stale server, not a connection failure', () => {
  const {searchFailure} = require('../static/journey.js');
  assert.match(searchFailure({status:404},false,'127.0.0.1'),/Restart it with the latest project code/);
  assert.match(searchFailure({status:404},false,'example.com'),/being updated/);
  assert.doesNotMatch(searchFailure({status:404},false,'example.com'),/local server/);
});
test('rate limiting and unavailable stop data have actionable messages', () => {
  const {searchFailure} = require('../static/journey.js');
  assert.match(searchFailure({status:429},false,'localhost'),/Wait a minute/);
  assert.match(searchFailure({status:503},false,'localhost'),/Stop data is temporarily unavailable/);
  assert.match(searchFailure({status:404},true,'localhost'),/Reinícialo/);
});
test('itineraries expire at departure or five-minute revalidation deadline', () => {
  const {itineraryExpired}=require('../static/journey.js');
  assert.equal(itineraryExpired({departure:1000,requested_at:100,valid_until:400},399),false);
  assert.equal(itineraryExpired({departure:1000,requested_at:100,valid_until:400},400),true);
  assert.equal(itineraryExpired({departure:200,requested_at:100},201),true);
});
