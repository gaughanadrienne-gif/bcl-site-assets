const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tools = require('../bcl-tools.js');
const source = fs.readFileSync(require.resolve('../bcl-tools.js'), 'utf8');
const rows = [1750, 2500, 3500, null, 0, 'unknown'].map((rent, i) => ({
  headline: 'Rental ' + i, monthly_rent: rent, bedrooms: 2,
  locality: 'Boulder Creek', verification_status: 'verified'
}));

test('mobile controls preserve compact checkboxes and 44px date actions', () => {
  assert.match(source, /input\[type=checkbox\]\{width:18px;height:18px;min-width:18px;flex:0 0 18px/);
  assert.match(source, /bcl-rent-limit\{flex:0 0 auto;/);
  assert.match(source, /#bcl-events \.bcl-range button,#bcl-events input\[type=date\],#bcl-events \.bcl-ev-clear\{min-height:44px/);
});

test('rental maximum includes its boundary and excludes unknown or invalid prices', () => {
  assert.deepEqual(tools.filterRentals(rows, {maxRent: 2500}).map(r => r.monthly_rent).sort(), [1750, 2500]);
});
test('without a rent ceiling undisclosed rents remain available', () => {
  assert.equal(tools.filterRentals(rows, {}).length, rows.length);
  assert.equal(tools.filterRentals(rows, {maxRent: 0}).length, rows.length);
});
test('rental ceiling composes with bedrooms, verification and town', () => {
  const extras = [
    {...rows[0], verification_status: 'unverified'},
    {...rows[0], bedrooms: 1},
    {...rows[0], locality: 'Felton'}
  ];
  assert.equal(tools.filterRentals([...rows, ...extras], {
    maxRent: 2500, minBeds: 2, verifiedOnly: true, town: 'Boulder Creek'
  }).length, 2);
});
test('rentals reset retains verified-only default and announces changing results', () => {
  const rental = source.slice(source.indexOf('function initRentals('), source.indexOf('/* ---------- events ---------- */'));
  assert.match(rental, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(rental, /maxRentInput\.value = "";\s+verifiedBox\.checked = true;/);
  assert.match(rental, /A maximum rent hides listings with no published rent/);
  assert.match(rental, /No rentals match these filters/);
});
test('directory and food reset clears category, group and both checkbox filters', () => {
  const listings = source.slice(source.indexOf('function initListings('), source.indexOf('/* ---------- jobs ---------- */'));
  assert.match(listings, /input\.value = "";\s+select\.value = "";\s+activeGroup = "";\s+openBox\.checked = false;\s+bcBox\.checked = false;\s+visibleLimit = batchSize;/);
});
test('events reset restores all upcoming, date ordering and initial batch', () => {
  const events = source.slice(source.indexOf('function initEvents('), source.indexOf('/* ---------- mountain status ---------- */'));
  assert.match(events, /catSel\.value = "";\s+sortSel\.value = "date";\s+fromInput\.value = "";\s+toInput\.value = "";\s+range = "all";\s+visibleLimit = batchSize;/);
  assert.match(events, /setAttribute\("aria-pressed"/);
});
