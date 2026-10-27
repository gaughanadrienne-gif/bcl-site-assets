const test=require('node:test');
const assert=require('node:assert/strict');
const t=require('../bcl-tools.js');
const job=deadline=>({title:'Worker',geography_tier:'core',city:'Felton',application_deadline:deadline});
test('explicit source formats expire only after the closing Pacific day',()=>{
 for(const d of ['2026-10-26','10/26/2026','10/26/26','Monday, October 26, 2026 11:59 PM']){
  assert.equal(t.jobDeadlineDay(d),'2026-10-26');
  assert.equal(t.jobIsExpired(job(d),'2026-10-26'),false);
  assert.equal(t.jobIsExpired(job(d),'2026-10-27'),true);
 }
});
test('invalid and open-ended deadlines never imply closure',()=>{
 for(const d of ['',null,'Continuous','Until Filled','By Date','October 26','2026-02-30','13/26/26','10/26/20267']) assert.equal(t.jobIsExpired(job(d),'2026-10-27'),false);
});
test('Pacific boundary is independent of visitor timezone and UTC date',()=>{
 assert.equal(t.jobIsExpired(job('10/26/26'),new Date('2026-10-27T06:59:59Z')),false);
 assert.equal(t.jobIsExpired(job('10/26/26'),new Date('2026-10-27T07:00:00Z')),true);
});
test('active board and homepage omit expired jobs even from stale feeds',()=>{
 const rows=[job('10/26/26'),{...job('Until Filled'),title:'Ongoing'},{...job('10/30/26'),title:'Future'}];
 assert.deepEqual(t.filterJobs(rows,{today:'2026-10-27'}).map(j=>j.title).sort(),['Future','Ongoing']);
 const stale=[job('2000-01-01'),{...job('Until Filled'),title:'Ongoing'}];
 assert.deepEqual(t.homeJobs(stale,3).map(j=>j.title),['Ongoing']);
});
test('search hides expired indexed jobs while preserving open-ended jobs and unrelated records',()=>{
 const rows=[{t:'job',n:'Expired',deadline:'10/26/26'},{t:'job',n:'Open',deadline:'Until Filled'},{t:'article',n:'Story'}];
 assert.deepEqual(t.filterCurrentSearchRecords(rows,null,'2026-10-27').map(r=>r.n),['Open','Story']);
});

test('search rerender preserves an already-validated multi-day event',()=>{
 const event={t:'event',n:'Exhibit',s:'2026-10-01 Museum'};
 const first=t.filterCurrentSearchRecords([event,{t:'job',n:'Expired',deadline:'10/26/26'}],[{title:'Exhibit',start:'2026-10-01',end:'2026-10-31'}],'2026-10-27');
 assert.deepEqual(t.filterActiveJobSearchRecords(first,'2026-10-27'),[event]);
});
