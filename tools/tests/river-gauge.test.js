const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

/* Shape captured from waterservices.usgs.gov on 2026-07-29 for site 11160500. */
function series(code, value, dateTime, qualifiers) {
  return {
    variable: { variableCode: [{ value: code }] },
    values: [{ value: [{ value: value, dateTime: dateTime, qualifiers: qualifiers || ["P"] }] }]
  };
}
const USGS = { value: { timeSeries: [
  series("00060", "21.6", "2026-07-29T08:30:00.000-07:00"),
  series("00065", "3.26", "2026-07-29T08:30:00.000-07:00")
] } };

/* Shape captured from api.water.noaa.gov/nwps/v1/gauges/BTEC1 on 2026-07-29. */
const NWPS = { lid: "BTEC1", usgsId: "11160500", flood: { stageUnits: "ft", categories: {
  major: { stage: 21.76 }, moderate: { stage: 19.5 }, minor: { stage: 16.5 }, action: { stage: 14 }
} } };

test("the gauge is the verified San Lorenzo site", () => {
  assert.equal(t.RIVER.site, "11160500");
  assert.equal(t.RIVER.lid, "BTEC1");
});
test("a reading pulls stage and flow with the time it was taken", () => {
  const r = t.riverReading(USGS);
  assert.equal(r.stage, 3.26);
  assert.equal(r.flow, 21.6);
  assert.equal(r.at, "2026-07-29T08:30:00.000-07:00");
  assert.equal(r.provisional, true);
});
test("one missing parameter does not discard the other", () => {
  const r = t.riverReading({ value: { timeSeries: [series("00065", "3.26", "2026-07-29T08:30:00.000-07:00")] } });
  assert.equal(r.stage, 3.26);
  assert.equal(r.flow, null);
});
test("an empty, malformed or sentinel response yields no reading at all", () => {
  assert.equal(t.riverReading({ value: { timeSeries: [] } }), null);
  assert.equal(t.riverReading({}), null);
  assert.equal(t.riverReading(null), null);
  assert.equal(t.riverReading({ value: { timeSeries: [series("00065", "-999999", "2026-07-29T08:30:00.000-07:00")] } }), null,
    "the USGS no-data sentinel is not a river level");
});
test("flood categories are quoted from NWS, lowest threshold first", () => {
  assert.deepEqual(t.riverFloodCategories(NWPS).map(c => [c.key, c.stage]),
    [["action", 14], ["minor", 16.5], ["moderate", 19.5], ["major", 21.76]]);
});
test("no published thresholds means no thresholds shown", () => {
  assert.deepEqual(t.riverFloodCategories(null), []);
  assert.deepEqual(t.riverFloodCategories({ flood: {} }), []);
  assert.deepEqual(t.riverFloodCategories({ flood: { categories: { minor: {} } } }), []);
});
test("the card publishes the numbers and their source", () => {
  const html = t.riverCardHTML(t.riverReading(USGS), t.riverFloodCategories(NWPS));
  assert.ok(html.indexOf("3.26 ft") >= 0);
  assert.ok(html.indexOf("22 cfs") >= 0);
  assert.ok(html.indexOf("USGS gauge 11160500") >= 0);
  assert.ok(html.indexOf("Provisional data") >= 0);
  assert.ok(html.indexOf("waterdata.usgs.gov") >= 0 && html.indexOf("water.noaa.gov") >= 0);
  assert.equal(html.indexOf("undefined"), -1);
});
/* The safety property: the card reports, it never rules. */
test("the card never converts a reading into a condition", () => {
  const html = t.riverCardHTML(t.riverReading(USGS), t.riverFloodCategories(NWPS)).toLowerCase();
  ["normal", "safe", "all clear", "all-clear", "no flooding", "below flood", "low water", "danger"].forEach(word => {
    assert.equal(html.indexOf(word), -1, "must not say: " + word);
  });
});
test("thresholds are attributed to NWS and carry their own link", () => {
  const html = t.riverCardHTML(t.riverReading(USGS), t.riverFloodCategories(NWPS));
  assert.ok(html.indexOf("National Weather Service stages for this gauge") >= 0);
  assert.ok(html.indexOf("Minor flood 16.5 ft") >= 0);
});
test("with no thresholds the card still renders, just without them", () => {
  const html = t.riverCardHTML(t.riverReading(USGS), []);
  assert.ok(html.indexOf("3.26 ft") >= 0);
  assert.equal(html.indexOf("National Weather Service stages"), -1);
});
