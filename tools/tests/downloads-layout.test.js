const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(root, 'squarespace/pages/downloads.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'tools/bcl-usability.js'), 'utf8');
test('library removes smoke listing without deleting its existing PDF', () => {
  assert.equal((page.match(/class="bcl-card"/g) || []).length, 16);
  assert.doesNotMatch(page, /Smoke.Ready|Smoke_Ready/);
  assert.ok(fs.existsSync(path.join(root, 'downloads/Boulder_Creek_Smoke_Ready_Home_Plan.pdf')));
});
test('all four category links have native anchor targets', () => {
  for (const id of ['everyday', 'preparedness', 'house-property', 'settling-exploring']) {
    assert.ok(page.includes('href="#' + id + '"'));
    assert.ok(page.includes('id="' + id + '"'));
  }
});
test('resource reading order is title, description, action, then preview', () => {
  const cards = page.match(/<div class="bcl-card">[\s\S]*?<\/div>/g);
  for (const card of cards) {
    if (card.includes('<img')) assert.ok(card.indexOf('Download PDF') < card.indexOf('<img'));
  }
  assert.match(code, /card.appendChild\(img\)/);
  assert.match(code, /grid-template-columns:minmax\(0,1fr\) minmax\(200px,280px\)/);
  assert.match(code, /grid-row:2/);
  assert.match(code, /copy.appendChild\(child\)/);
  assert.match(code, /background:transparent!important/);
});
