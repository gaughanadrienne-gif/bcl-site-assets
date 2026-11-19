const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../bcl-tools.js");

/* Wednesday November 18, 2026, 3:30 PM Pacific (PST, UTC-8): the state measured
   in the phone journey audit that prompted homeBoardEvents. */
const NOW = new Date("2026-11-18T23:30:00Z");
const TODAY = "2026-11-18";
const EXHIBIT_A = { title: "Exhibit: Retrospect", start: "2026-07-16", end: "2026-12-31" };
const EXHIBIT_B = { title: "Exhibit: Moments", start: "2026-09-01", end: "2027-01-24" };
const STORYTIME = { title: "Storytime", start: "2026-11-18T11:00", end: "2026-11-18T12:00" };
const MATINEE = { title: "Family Movie Matinee", start: "2026-11-18T15:00", end: "2026-11-18T18:00" };
const BAR = { title: "Neighborhood Night", start: "2026-11-18T20:00", end: null };
const FAIRE = { title: "Craft Faire", start: "2026-11-21T10:00", end: "2026-11-21T16:00" };
const ROWS = [EXHIBIT_A, EXHIBIT_B, STORYTIME, MATINEE, BAR, FAIRE];

test("the calendar order is unchanged: nextEvents still leads with ongoing runs", () => {
  assert.deepEqual(t.nextEvents(ROWS, TODAY, 3, NOW).map((e) => e.title),
    ["Exhibit: Retrospect", "Exhibit: Moments", "Storytime"]);
});

test("homepage board: dated events first, one ongoing run, nothing already over", () => {
  assert.deepEqual(t.homeBoardEvents(ROWS, TODAY, 3, NOW).map((e) => e.title),
    ["Family Movie Matinee", "Neighborhood Night", "Exhibit: Retrospect"]);
});

test("an event with no end time is kept for the day", () => {
  const late = new Date("2026-11-19T05:30:00Z"); // 9:30 PM Pacific, after the 8 PM start
  assert.equal(t.evHasEnded(BAR, late), false);
  assert.ok(t.homeBoardEvents(ROWS, TODAY, 3, late).some((e) => e.title === "Neighborhood Night"));
});

test("an event is over only after its end time, in Pacific time", () => {
  assert.equal(t.evHasEnded(STORYTIME, new Date("2026-11-18T19:59:00Z")), false); // 11:59 AM
  assert.equal(t.evHasEnded(STORYTIME, new Date("2026-11-18T20:01:00Z")), true);  // 12:01 PM
  assert.equal(t.evHasEnded(EXHIBIT_A, NOW), false); // date-only end: never "over" by the clock
});

test("with no dated events the board falls back to ongoing runs", () => {
  assert.deepEqual(t.homeBoardEvents([EXHIBIT_B, EXHIBIT_A], TODAY, 3, NOW).map((e) => e.title),
    ["Exhibit: Retrospect", "Exhibit: Moments"]);
});

test("with no ongoing runs the board is simply the next dated events", () => {
  assert.deepEqual(t.homeBoardEvents([FAIRE, MATINEE, BAR, STORYTIME], TODAY, 3, NOW).map((e) => e.title),
    ["Family Movie Matinee", "Neighborhood Night", "Craft Faire"]);
});

test("a single dated event still leaves room for more than one ongoing run", () => {
  assert.deepEqual(t.homeBoardEvents([EXHIBIT_A, EXHIBIT_B, FAIRE], TODAY, 3, NOW).map((e) => e.title),
    ["Craft Faire", "Exhibit: Retrospect", "Exhibit: Moments"]);
});
