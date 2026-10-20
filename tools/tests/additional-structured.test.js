const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const t = require('../bcl-tools.js');
const root = path.resolve(__dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const specs = read('jobs/additional-reviewed-corrections.json').corrections;
const jobs = read('data/jobs.json').jobs;
const dir = read('data/directory.json');
const fixture = read('tests/fixtures/additional-structured-contract.json');

test('newly disclosed ordinary pay participates in listed-pay and comparable bands', () => {
  const spec = specs.find(s => s.fields.salary_disclosed && ['hour','year'].includes(s.fields.salary_period));
  assert.ok(spec);
  const job = jobs.find(j => j.id === spec.id);
  assert.equal(spec.accepted_presence.salary_disclosed[0].value, false);
  const expected = job.salary_min / (job.salary_period === 'hour' ? 1 : 2080);
  assert.equal(t.jobHourlyEquivalent(job), expected);
  assert.equal(t.filterJobs([job], {tab:'local', includeExtended:true, payListedOnly:true}).length, 1);
  assert.equal(t.filterJobs([job], {tab:'local', includeExtended:true, minHourly:expected}).length, 1);
  assert.equal(t.filterJobs([job], {tab:'local', includeExtended:true, minHourly:expected+1}).length, 0);
});

test('reviewed non-annual pay stays listed, visible and outside hourly bands', () => {
  const nonAnnual = jobs.filter(j => specs.some(s => s.id === j.id) && ['day','season','teaching_unit_semester'].includes(j.salary_period));
  assert.ok(nonAnnual.length > 10);
  for (const j of nonAnnual) {
    assert.equal(t.jobHourlyEquivalent(j), null, j.title);
    assert.equal(t.filterJobs([j], {tab:'local', includeExtended:true, payListedOnly:true}).length, 1, j.title);
    assert.equal(t.filterJobs([j], {tab:'local', includeExtended:true, minHourly:20}).length, 0, j.title);
    if (j.salary_period === 'teaching_unit_semester') assert.match(t.jobSalaryText(j), /teaching unit.*semester/i);
    if (j.salary_period === 'season') assert.match(t.jobSalaryText(j), /season/i);
  }
});
test('unit labels preserve conditional doctoral pay and are not duplicated', () => {
  const detailed = jobs.find(j => /eligible annual doctoral stipend/.test(j.salary_text));
  assert.ok(detailed);
  assert.equal(t.jobSalaryText(detailed), detailed.salary_text);
  assert.match(t.jobSalaryText(detailed), /\$111 per unit/);
  const comma = {salary_disclosed:true, salary_period:'teaching_unit_semester', salary_text:'$1,599-$2,454 per teaching unit, per semester'};
  assert.equal(t.jobSalaryText(comma), comma.salary_text);
  const season = {salary_disclosed:true, salary_period:'season', salary_text:'Season Stipend $4,512 Stipend'};
  assert.equal(t.jobSalaryText(season), season.salary_text);
  const day = jobs.find(j => j.salary_period === 'day' && /8 hours Daily/.test(j.salary_text));
  assert.equal(t.jobSalaryText(day), day.salary_text);
});
test('hybrid mathematics stays local and is visible on cards and home', () => {
  const job = jobs.find(j => j.id === '99e5c266f229e75feffe9aa817083c10e860e40c');
  assert.equal(t.jobTab(job), 'local');
  assert.equal(job.city, 'Aptos');
  for (const html of [t.jobCard(job), t.homeJobRow(job)]) {
    assert.match(html, /Aptos/);
    assert.equal((html.match(/Hybrid/g)||[]).length, 1);
    assert.doesNotMatch(html, /Remote/);
  }
});
test('a pay review does not claim a location or schedule review', () => {
  const spec = specs.find(s => 'salary_disclosed' in s.fields && !('city' in s.fields));
  const job = jobs.find(j => j.id === spec.id);
  const html = t.jobCard(job);
  assert.match(html, /Job details checked 2026-10-12/);
  assert.doesNotMatch(html, /Location\/schedule checked/);
});
test('exact search mirrors match corrected locations/mode without dropping records', () => {
  const search = read('data/search-index.json').records;
  for (const mirror of fixture.search) {
    const matches = search.filter(r => r.t === 'job' && r.n === mirror.after.n && r.s === mirror.after.s && r.k === mirror.after.k);
    assert.equal(matches.length, 1, mirror.id);
  }
});
test('directory fallback carries exactly corrected card text and callable phone', () => {
  assert.equal(dir.updated, '2026-09-26'); // Corrections do not renew verification.
  const source = fs.readFileSync(path.join(root,'squarespace/static_block_snippets/DIRECTORY_PASTE_ME.js'),'utf8');
  const literal = source.match(/var FRAG = ("(?:\\.|[^"\\])*");/s)[1];
  const fragment = JSON.parse(literal);
  for (const card of fixture.directory_cards) {
    assert.ok(fragment.includes(card.after), card.name);
  }
  assert.match(fragment, /tel:8552845239/);
  assert.doesNotMatch(fragment, /tel:8552845233/);
  assert.ok(fragment.includes('last updated '+dir.updated));
});
test('service qualifiers stay conservative while regular hours parse', () => {
  const find = name => dir.listings.find(d => d.name.includes(name));
  const wednesday = new Date('2026-10-14T17:00:00Z');
  for (const name of ['Planning & Unified Permit','Burrell','Integrity Automotive']) {
    assert.equal(t.listingOpenState(find(name),wednesday), 'unknown', name);
  }
  const skip = find("Skip's Tire");
  assert.equal(t.listingOpenState(skip,new Date('2026-10-14T01:30:00Z')), 'open');
});

test('recoverably routed jobs are absent from public jobs and every search mirror', () => {
  const ids = new Set(fixture.approved_review_routing_ids);
  assert.equal(ids.size, 3);
  assert.equal(read('data/jobs.json').count, jobs.length);
  assert.equal(new Set(jobs.map(j => j.id)).size, jobs.length);
  assert.ok(jobs.every(job => !ids.has(job.id)));
  const search = read('data/search-index.json').records;
  for (const title of fixture.approved_review_routing_titles) {
    assert.equal(search.filter(row => row.t === 'job' && row.n === title).length, 0, title);
  }
  assert.equal(search.filter(row => row.t === 'job').length, jobs.length);
});

test('rain method distinguishes uncovered years and older coverage metadata', () => {
  const base = {record:{first_water_year:2000,last_water_year:2001},excluded:[]};
  assert.match(t.rainMethodHTML({...base,method:{monthly_unchecked_years:[2000]}}), /No monthly comparison.*2000/);
  assert.match(t.rainMethodHTML({...base,method:{monthly_unchecked_years:[]}}), /Every water year.*has a monthly comparison/);
  assert.match(t.rainMethodHTML(base), /coverage was not supplied/);
  assert.match(t.rainMethodHTML(base), /where both series exist/);
});

test('AQI output credits both providers and retains model and ground-monitor caveats', async () => {
  const saved = global.fetch;
  try {
    global.fetch = async () => ({ok:true,json:async () => ({current:{us_aqi:21,pm2_5:4}})});
    const el = {innerHTML:''};
    t.fillAQI(el);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(el.innerHTML, /Open-Meteo/);
    assert.match(el.innerHTML, /Copernicus Atmosphere Monitoring Service \(CAMS\)/);
    assert.match(el.innerHTML, /https:\/\/confluence\.ecmwf\.int/);
    assert.match(el.innerHTML, /Modeled estimate/);
    assert.match(el.innerHTML, /fire\.airnow\.gov/);
    assert.match(el.innerHTML, /ground monitors/);
  } finally { global.fetch = saved; }
});
