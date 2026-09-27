const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("no NWS alerts: green banner states only what was checked", () => {
  const h = t.statusVerdictHTML([], 0);
  assert.ok(!/is-alert|is-unknown/.test(h));
  assert.match(text(h), /No weather alerts for Boulder Creek right now/);
  assert.match(text(h), /No active Caltrans closures/);
  assert.match(text(h), /Power and county roads are not tracked here/);
  assert.match(text(h), /call 911/);
  assert.doesNotMatch(text(h), /all clear|nothing needs action/i);
});

test("closure count is pluralized and reported, never hidden", () => {
  assert.match(text(t.statusVerdictHTML([], 1)), /1 active Caltrans closure on/);
  assert.match(text(t.statusVerdictHTML([], 3)), /3 active Caltrans closures on/);
});

test("active alerts: alert banner names every event and escapes it", () => {
  const h = t.statusVerdictHTML(["Red Flag Warning", "Heat <Advisory>"], 0);
  assert.match(h, /is-alert/);
  assert.match(h, /role="alert"/);
  assert.match(text(h), /2 weather alerts in effect: Red Flag Warning, Heat &lt;Advisory&gt;/);
  assert.match(text(h), /CruzAware/);
});

test("NWS unreachable: neutral banner that is explicitly not an all-clear", () => {
  const h = t.statusVerdictHTML(null, 2);
  assert.match(h, /is-unknown/);
  assert.match(text(h), /could not be checked/);
  assert.match(text(h), /not an all-clear/);
  assert.doesNotMatch(text(h), /No weather alerts/);
});

test("Caltrans feed failure is stated in every banner state", () => {
  for (const alerts of [[], ["Wind Advisory"], null]) {
    assert.match(text(t.statusVerdictHTML(alerts, null)), /Caltrans closures could not be checked/);
  }
});
