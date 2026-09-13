const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const t = require('../bcl-tools.js');
const src = fs.readFileSync(path.join(__dirname, '../bcl-tools.js'), 'utf8');
const rows = [
  {title:'Valley',city:'Ben Lomond',geography_tier:'core',employment_type:'Part-Time',posted_at:'2026-09-12'},
  {title:'Nearby',city:'Santa Cruz',geography_tier:'core',employment_type:'Full Time',first_seen_at:'2026-09-13'},
  {title:'Farther',city:'Watsonville',geography_tier:'extended',employment_type:'Temporary'}
];
test('valley-only area excludes nearby and extended jobs',()=>assert.deepEqual(t.filterJobs(rows,{area:'slv',includeExtended:true}).map(j=>j.title),['Valley']));
test('work schedule handles hyphenated labels',()=>assert.deepEqual(t.filterJobs(rows,{employmentType:'part time'}).map(j=>j.title),['Valley']));
test('full and part time qualifies under either schedule',()=>{
  const mixed=[{...rows[0],employment_type:'Full and Part Time'}];
  assert.equal(t.filterJobs(mixed,{employmentType:'full time'}).length,1);
  assert.equal(t.filterJobs(mixed,{employmentType:'part time'}).length,1);
});
test('recent filter can require an employer date',()=>assert.deepEqual(t.filterJobs(rows,{postedWithinDays:7,employerDateOnly:true,today:'2026-09-13'}).map(j=>j.title),['Valley']));
test('live Jobs board bounds cards and avoids map callback index as date',()=>{
  const fn=src.slice(src.indexOf('function initJobs'),src.indexOf('/* ---------- rentals'));
  assert.match(fn,/rows\.slice\(0, visibleLimit\)\.map\(function \(job\) \{ return jobCard\(job\); \}\)/);
  assert.match(fn,/visibleLimit = 20/);
  assert.doesNotMatch(fn,/data-tab="remote"/);
  assert.match(fn,/j\.geography_tier !== "remote"/);
});
test('local employer remote card labels work mode without claiming a commute',()=>{
  const html=t.jobCard({...rows[0],work_mode:'remote',commute_minutes:9},'2026-09-13');
  assert.match(html,/Remote with local employer/);
  assert.doesNotMatch(html,/Estimated drive/);
});
