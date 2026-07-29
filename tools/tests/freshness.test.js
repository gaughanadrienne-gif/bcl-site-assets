const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

test("monthYear reduces a verified date to month and year", () => {
  assert.equal(t.monthYear("2026-07-15"), "Jul 2026");
  assert.equal(t.monthYear("2026-01-02"), "Jan 2026");
  assert.equal(t.monthYear("2025-12-31"), "Dec 2025");
});
test("monthYear returns nothing rather than guessing", () => {
  assert.equal(t.monthYear(""), "");
  assert.equal(t.monthYear(null), "");
  assert.equal(t.monthYear(undefined), "");
  assert.equal(t.monthYear("soon"), "");
  assert.equal(t.monthYear("2026-13-01"), "");
});
test("a listing card shows Last verified only when the feed supplies a date", () => {
  const withDate = t.listingCard({ name: "Ace Plumbing", category: "Plumbing & HVAC", verified_at: "2026-07-15" });
  assert.ok(withDate.indexOf("Last verified Jul 2026") >= 0);
  const without = t.listingCard({ name: "Ace Plumbing", category: "Plumbing & HVAC" });
  assert.equal(without.indexOf("Last verified"), -1);
  assert.equal(without.indexOf("undefined"), -1);
});
test("updatedSuffix prints a stamp the reader can trust", () => {
  assert.equal(t.updatedSuffix("2026-07-28", "2026-07-29"), " · UPDATED 2026-07-28");
  assert.equal(t.updatedSuffix("2026-07-29", "2026-07-29"), " · UPDATED 2026-07-29");
});
test("updatedSuffix says nothing when the stamp is missing or stale", () => {
  assert.equal(t.updatedSuffix("", "2026-07-29"), "");
  assert.equal(t.updatedSuffix(null, "2026-07-29"), "");
  assert.equal(t.updatedSuffix("unknown", "2026-07-29"), "");
  assert.equal(t.updatedSuffix("2026-01-01", "2026-07-29"), "", "a six-month-old stamp is worse than none");
});
test("dayAge counts whole days and handles a date ahead of today", () => {
  assert.equal(t.dayAge("2026-07-22", "2026-07-29"), 7);
  assert.equal(t.dayAge("2026-07-29", "2026-07-29"), 0);
  assert.equal(t.dayAge("2026-07-30", "2026-07-29"), -1);
  assert.equal(t.dayAge("", "2026-07-29"), null);
});
test("todayKey formats a padded local day key", () => {
  assert.equal(t.todayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(t.todayKey(new Date(2026, 10, 30)), "2026-11-30");
});
