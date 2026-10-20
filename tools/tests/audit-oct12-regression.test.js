const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const t = require('../bcl-tools.js');

test('opening hours stay in Pacific time for LA, New York and London readers', () => {
  const script = `const t=require(${JSON.stringify(path.join(__dirname,'../bcl-tools.js'))});
    const hours={hours_text:'Daily 8am-9pm'};
    process.stdout.write(JSON.stringify([
      t.listingOpenState(hours,new Date('2026-10-12T14:00Z')),
      t.listingOpenState(hours,new Date('2026-10-12T15:00Z')),
      t.listingOpenState(hours,new Date('2026-01-12T15:00Z')),
      t.listingOpenState(hours,new Date('2026-01-12T16:00Z')),
      t.listingOpenState({hours_text:'Monday 8pm-1am'},new Date('2026-10-13T07:30Z')),
      t.listingOpenState({hours_text:'Monday 8pm-1am'},new Date('2026-10-13T08:00Z'))
    ]));`;
  for(const TZ of ['America/Los_Angeles','America/New_York','Europe/London']) {
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ},encoding:'utf8'})),
      ['closed','open','closed','open','open','closed'],TZ);
  }
});

test('calendar exports use actual Pacific instants on both sides of DST', () => {
  for(const [start,utc] of [
    ['2026-10-15T11:00','20261015T180000Z'],
    ['2026-11-01T11:00','20261101T190000Z'],
    ['2026-03-07T11:00','20260307T190000Z'],
    ['2026-03-08T11:00','20260308T180000Z'],
    ['2026-11-01T01:30','20261101T083000Z']
  ]) assert.ok(t.icsForEvent({title:'Pacific event',start}).includes('DTSTART:'+utc),start);
  assert.equal(t.icsForEvent({title:'Missing spring hour',start:'2026-03-08T02:30'}),'');
  assert.match(t.icsForEvent({title:'All day',start:'2026-11-01'}),/DTSTART;VALUE=DATE:20261101/);
  assert.match(t.icsForEvent({title:'All day',start:'2026-11-01'}),/DTEND;VALUE=DATE:20261102/);
});

test('real extra-help titles survive the Temporary filter even on an old data edge', () => {
  const rows=[
    {id:'afa0227654b02382e47861ba256196135e01fd57',title:'HEAD LIFEGUARD (Extra Help)',employment_type:'',geography_tier:'core'},
    {id:'b111a81476d9c133639dac58ef20e9284d66ccd4',title:'LIFEGUARD (Extra Help)',employment_type:'',geography_tier:'core'},
    {id:'permanent',title:'Lifeguard Supervisor',employment_type:'Full Time',geography_tier:'core'}
  ];
  assert.deepEqual(t.filterJobs(rows,{q:'lifeguard',employmentType:'temporary'}).map(j=>j.id).sort(),rows.slice(0,2).map(j=>j.id).sort());
});

test('reviewed local-employer remote roles stay on the local board without commute text', () => {
  const job={title:'Regional Director',canonical_url:'https://www.edjoin.org/Home/JobPosting/2284022',city:'Aptos',
    employer_name:'Cabrillo College',work_mode:'remote',geography_tier:'remote',location_precision:'remote',
    local_employer_verified:true,local_employer_evidence_url:'https://www.edjoin.org/Home/JobPosting/2284022',remote_regions:'California',commute_minutes:null};
  assert.equal(t.filterJobs([job],{}).length,1);
  assert.match(t.jobCard(job),/Remote within California/);
  assert.doesNotMatch(t.jobCard(job),/Estimated drive/);
});

test('unknown hours are excluded from Open now and remain available with it off', () => {
  assert.equal(t.listingOpenState({hours_text:'Call for hours'},new Date('2026-10-12T16:00Z')),'unknown');
  const source=fs.readFileSync(path.join(__dirname,'../bcl-tools.js'),'utf8');
  assert.match(source,/openNow && listingOpenState\(l, now\) !== "open"/);
  assert.ok(source.includes('Turn it off to see places with unknown or conditional hours'));
});

test('rainfall methodology distinguishes annual totals from peak-flow engineering', () => {
  const html=t.rainMethodHTML({record:{median:42.69,mean:49.09}});
  assert.match(html,/site-specific peak design flow/);
  assert.doesNotMatch(html,/better number for sizing/);
  assert.doesNotMatch(t.rainRankText(0,68),/the driest start/);
  assert.match(t.rainStatsHTML({current:{missing_days:1,to_date:0,drier_years_to_date:0,years_compared:68}}),/rank not available/);
});

test('decorative orange marks are removed while focus outlines are retained', () => {
  const source=fs.readFileSync(path.join(__dirname,'../bcl-tools.js'),'utf8');
  for(const selector of ['.bcl-actionrow:before{','.bcl-cat-head:before{','.bcl-today-head:before{','.bcl-article-layout>h2:before,']) assert.ok(!source.includes(selector),selector);
  assert.ok(source.includes(':focus-visible{outline:3px solid #d56e47'));
});
