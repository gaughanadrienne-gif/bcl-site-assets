/* An event occupies a RANGE of days. Museum exhibits opened in July and ran to
   September and December, so they qualified as upcoming, but the calendar keyed
   every display and filter decision off the START date. The page opened with a
   "July 2026" heading three weeks after July, and the Today / This weekend chips
   hid exhibits that were open that very day. */
const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const SAT_AUG_8 = new Date(2026, 7, 8);          // a Saturday
const EXHIBIT = { title: "Exhibit: Retrospect", start: "2026-07-16", end: "2026-12-31" };
const CLOSED  = { title: "Exhibit: Closed", start: "2026-06-01", end: "2026-07-31" };
const MARKET  = { title: "Farmers Market", start: "2026-08-13" };
const TODAY_EV = { title: "Guided Hike", start: "2026-08-08T09:00" };

test("an exhibit already open is ongoing, not upcoming-by-start-date", () => {
  assert.equal(t.evIsOngoing(EXHIBIT, SAT_AUG_8), true);
});

test("an exhibit that has closed is not ongoing", () => {
  assert.equal(t.evIsOngoing(CLOSED, SAT_AUG_8), false);
});

test("a single-day event is never ongoing", () => {
  assert.equal(t.evIsOngoing(MARKET, SAT_AUG_8), false);
  assert.equal(t.evIsOngoing(TODAY_EV, SAT_AUG_8), false);
});

test("an event that has not opened yet is not ongoing", () => {
  assert.equal(t.evIsOngoing({ start: "2026-09-01", end: "2026-09-30" }, SAT_AUG_8), false);
});

test("the chip names the closing date, so no stale start date is shown", () => {
  assert.equal(t.evThroughChip(EXHIBIT.end), "THROUGH DEC 31");
});

test("Today includes an exhibit that is open today", () => {
  assert.equal(t.eventInRange(EXHIBIT, { range: "today", today: SAT_AUG_8 }), true);
});

test("This weekend includes an exhibit that is open across it", () => {
  assert.equal(t.eventInRange(EXHIBIT, { range: "weekend", today: SAT_AUG_8 }), true);
});

test("Next 7 and Next 30 include an open exhibit", () => {
  assert.equal(t.eventInRange(EXHIBIT, { range: "7", today: SAT_AUG_8 }), true);
  assert.equal(t.eventInRange(EXHIBIT, { range: "30", today: SAT_AUG_8 }), true);
});

test("a custom window inside the run still matches the exhibit", () => {
  assert.equal(
    t.eventInRange(EXHIBIT, { range: "custom", from: "2026-08-10", to: "2026-08-12" }), true);
});

test("single-day filtering is unchanged", () => {
  assert.equal(t.eventInRange(MARKET, { range: "today", today: SAT_AUG_8 }), false);
  assert.equal(t.eventInRange(MARKET, { range: "weekend", today: SAT_AUG_8 }), false);
  assert.equal(t.eventInRange(MARKET, { range: "7", today: SAT_AUG_8 }), true);
  assert.equal(t.eventInRange(TODAY_EV, { range: "today", today: SAT_AUG_8 }), true);
});

test("a past single-day event stays out of every window", () => {
  const past = { title: "Old", start: "2026-08-05", end: "2026-08-05" };
  assert.equal(t.eventInRange(past, { range: "today", today: SAT_AUG_8 }), false);
  assert.equal(t.eventInRange(past, { range: "7", today: SAT_AUG_8 }), false);
  assert.equal(t.eventInRange(past, { range: "30", today: SAT_AUG_8 }), false);
});

test("a custom window entirely outside the event excludes it, both directions", () => {
  assert.equal(t.eventInRange(MARKET, { range: "custom", from: "2026-08-14", to: "2026-08-20" }), false);
  assert.equal(t.eventInRange(MARKET, { range: "custom", from: "2026-08-01", to: "2026-08-12" }), false);
});

test("an end date earlier than the start cannot shrink the span", () => {
  const bad = { title: "Typo", start: "2026-08-13", end: "2026-08-01" };
  assert.equal(t.eventInRange(bad, { range: "7", today: SAT_AUG_8 }), true);
});
