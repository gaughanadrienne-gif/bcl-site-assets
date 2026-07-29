const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

/* Wed 2026-07-29 is the reference day for these tests. */
const WED_10AM = new Date(2026, 6, 29, 10, 0);
const WED_7PM = new Date(2026, 6, 29, 19, 0);
const SAT_10AM = new Date(2026, 7, 1, 10, 0);
const MON_NOON = new Date(2026, 6, 27, 12, 0);

test("weekday hours parse into per-day intervals", () => {
  const parsed = t.parseHours("Monday-Friday 8am-5pm; Saturday-Sunday closed");
  assert.ok(parsed);
  assert.equal(parsed.always, false);
  assert.equal(parsed.intervals.length, 5);
  assert.ok(parsed.intervals.every(i => i.s === 8 * 60 && i.e === 17 * 60));
});
test("open state tracks the clock and the day", () => {
  const hours = "Monday-Friday 8am-5pm; Saturday-Sunday closed";
  assert.equal(t.listingOpenState({ hours_text: hours }, WED_10AM), "open");
  assert.equal(t.listingOpenState({ hours_text: hours }, WED_7PM), "closed");
  assert.equal(t.listingOpenState({ hours_text: hours }, SAT_10AM), "closed");
});
test("periods and a.m./p.m. spacing parse the same as bare am/pm", () => {
  assert.equal(t.listingOpenState({ hours_text: "Daily 9:00 a.m.-9:00 p.m." }, WED_10AM), "open");
  assert.equal(t.listingOpenState({ hours_text: "Monday-Friday 8:00 AM-5:00 PM" }, WED_10AM), "open");
});
test("a split shift closes between services", () => {
  const hours = "Monday-Saturday 11:00 a.m.-3:00 p.m. and 4:00-7:00 p.m.";
  assert.equal(t.listingOpenState({ hours_text: hours }, new Date(2026, 6, 29, 12, 0)), "open");
  assert.equal(t.listingOpenState({ hours_text: hours }, new Date(2026, 6, 29, 15, 30)), "closed");
  assert.equal(t.listingOpenState({ hours_text: hours }, new Date(2026, 6, 29, 18, 0)), "open");
});
test("an unmarked start borrows the meridiem that makes the range possible", () => {
  const parsed = t.parseHours("Daily 11:30-3:00 p.m.");
  assert.equal(parsed.intervals[0].s, 11 * 60 + 30, "11:30 is morning, not night");
  assert.equal(parsed.intervals[0].e, 15 * 60);
});
test("a closing time after midnight still counts as open in the small hours", () => {
  assert.equal(t.listingOpenState({ hours_text: "Daily 12pm-1:30am" }, new Date(2026, 6, 30, 0, 45)), "open");
  assert.equal(t.listingOpenState({ hours_text: "Daily 12pm-1:30am" }, new Date(2026, 6, 30, 2, 0)), "closed");
});
test("a stated closed day is honoured, not ignored", () => {
  const hours = "Wednesday-Sunday 11:00 a.m.-9:00 p.m.; Monday-Tuesday closed.";
  assert.equal(t.listingOpenState({ hours_text: hours }, MON_NOON), "closed");
  assert.equal(t.listingOpenState({ hours_text: hours }, new Date(2026, 6, 29, 12, 0)), "open");
});
test("round-the-clock services are always open", () => {
  ["24/7", "24/7/365", "Phone and text 24/7", "Dispatch 24/7/365"].forEach(h => {
    assert.equal(t.listingOpenState({ hours_text: h }, new Date(2026, 6, 30, 3, 0)), "open", h);
  });
});
/* This is the safety property of the whole feature. */
test("hours that cannot be read are unknown, never closed", () => {
  [
    "See school calendar",
    "First Sunday of each month 12pm-5pm; other times by appointment",
    "Winter: Tuesday-Thursday 11:30 a.m.-3:00 p.m.; weather and event closures possible.",
    "Office Monday-Friday 8:00 AM-5:00 PM; emergency response through 911",
    "Call for hours",
    "",
    null
  ].forEach(h => {
    assert.equal(t.parseHours(h), null, "should not parse: " + h);
    assert.equal(t.listingOpenState({ hours_text: h }, WED_10AM), "unknown", "should be unknown: " + h);
  });
});
test("an unreadable listing is flagged rather than dropped while Open now is on", () => {
  const html = t.listingCard({ name: "SLV Museum", hours_text: "By appointment" }, { openNow: true, now: WED_10AM });
  assert.ok(html.indexOf("Hours not auto-checked") >= 0);
  assert.ok(html.indexOf("SLV Museum") >= 0, "the listing is still rendered");
});
test("the flag stays off when nobody is filtering by hours", () => {
  const html = t.listingCard({ name: "SLV Museum", hours_text: "By appointment" });
  assert.equal(html.indexOf("Hours not auto-checked"), -1);
});
test("a readable listing gets no flag even while Open now is on", () => {
  const html = t.listingCard({ name: "Ace", hours_text: "Daily 9am-9pm" }, { openNow: true, now: WED_10AM });
  assert.equal(html.indexOf("Hours not auto-checked"), -1);
});
test("isOpenAt on a null parse is false, so callers must ask for the state", () => {
  assert.equal(t.isOpenAt(null, WED_10AM), false);
});
