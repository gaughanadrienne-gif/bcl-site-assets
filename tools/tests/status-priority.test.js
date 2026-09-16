const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../bcl-tools.js');
function closure(route, place, end='2026-09-20') {
  return {location:{begin:{beginRoute:route,beginNearbyPlace:place,beginCounty:'Santa Cruz'}},closure:{typeOfClosure:'One-Way Traffic',closureTimestamp:{closureStartDate:'2026-09-01',closureEndDate:end,closureEndEpoch:String(Date.parse(end+'T19:00:00-07:00')/1000)}}};
}
test('Boulder Creek closures stay in six visible rows ahead of coastal work',()=>{
 const rows = Array.from({length:7},(_,i)=>closure('SR-1','Coastal '+i));
 rows.push(closure('SR-9','Felton'),closure('SR-236','Boulder Creek'),closure('SR-9','Boulder Creek'));
 const first=t.sortCaltrans(rows).slice(0,6);
 assert.equal(first[0].location.begin.beginNearbyPlace,'Boulder Creek');
 assert.equal(first[1].location.begin.beginNearbyPlace,'Boulder Creek');
 assert.equal(rows[0].location.begin.beginRoute,'SR-1','sorting must not mutate the feed');
});
test('planned closure end never implies a reopened road',()=>{
 const text=t.caltransSchedule(closure('SR-9','Boulder Creek','2026-09-10'),new Date('2026-09-16T20:00:00Z'));
 assert.match(text,/Scheduled end has passed/);
 assert.match(text,/still marks this closure in effect/);
 assert.doesNotMatch(text,/reopened|all.clear/i);
});
test('indefinite closures ignore a stale planned end and unknown dates are not invented',()=>{
 const row=closure('SR-9','Boulder Creek','2026-09-10');row.closure.closureTimestamp.isClosureEndIndefinite='true';
 assert.match(t.caltransSchedule(row,new Date('2026-09-16')),/no scheduled end/);
 assert.doesNotMatch(t.caltransSchedule(row,new Date('2026-09-16')),/has passed/);
 assert.equal(t.caltransSchedule({closure:{}}),'');
});
test('different work windows remain distinguishable in deduplication',()=>{
 assert.equal(t.dedupeCaltrans([closure('SR-9','Boulder Creek'),closure('SR-9','Boulder Creek','2026-09-21')]).length,2);
});
test('successful retrieval timestamp identifies Pacific time and does not claim observation freshness',()=>{
 assert.match(t.statusRetrievedHTML(new Date('2026-09-16T20:00:00Z')),/PDT/);
 assert.match(t.statusRetrievedHTML(new Date('2026-09-16T20:00:00Z')),/Source observations may be older/);
 assert.match(t.RIVER.place,/downstream of Boulder Creek/);
});
