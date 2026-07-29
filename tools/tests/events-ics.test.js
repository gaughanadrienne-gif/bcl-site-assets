const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const STAMP = new Date(Date.UTC(2026, 6, 29, 15, 4, 5));

const TIMED = {
  id: "bclev1",
  title: "Boulder Creek Book Group",
  start: "2026-08-20T11:00",
  end: "2026-08-20T12:00",
  location: "Boulder Creek Branch Library, Boulder Creek",
  url: "https://santacruzpl.libnet.info/event/15401183",
  description: "Monthly library book group.",
  category: "Community"
};
const ALLDAY = { id: "bclev2", title: "Exhibit: Retrospect", start: "2026-08-16", end: null, location: "Grace Gallery" };
const MULTIDAY = { id: "bclev3", title: "Exhibit: The Road I Call Home", start: "2026-08-16", end: "2026-09-20" };

const lines = e => t.icsForEvent(e, STAMP).split("\r\n");
const field = (e, key) => lines(e).filter(l => l.indexOf(key) === 0)[0];

test("a timed event exports a floating local start and end", () => {
  assert.equal(field(TIMED, "DTSTART"), "DTSTART:20260820T110000");
  assert.equal(field(TIMED, "DTEND"), "DTEND:20260820T120000");
  assert.equal(field(TIMED, "DTSTART").indexOf("Z"), -1, "no UTC conversion, the time is the local one");
});
test("an all-day event is a DATE, and does not slide into the day before", () => {
  assert.equal(field(ALLDAY, "DTSTART"), "DTSTART;VALUE=DATE:20260816");
  assert.equal(field(ALLDAY, "DTEND"), "DTEND;VALUE=DATE:20260817", "iCalendar DTEND is exclusive");
});
test("a multi-day run ends the day after the last day", () => {
  assert.equal(field(MULTIDAY, "DTEND"), "DTEND;VALUE=DATE:20260921");
});
test("the file is a complete, single-event VCALENDAR", () => {
  const l = lines(TIMED);
  assert.equal(l[0], "BEGIN:VCALENDAR");
  assert.equal(l.indexOf("BEGIN:VEVENT") > 0, true);
  assert.equal(l.filter(x => x === "BEGIN:VEVENT").length, 1);
  assert.equal(l[l.length - 2], "END:VCALENDAR");
  assert.ok(field(TIMED, "DTSTAMP").indexOf("Z") > 0, "DTSTAMP is UTC by spec");
  assert.ok(field(TIMED, "UID").indexOf("@bouldercreeklocal.com") > 0);
});
test("commas, semicolons and newlines in the text are escaped", () => {
  const html = t.icsForEvent({ id: "x", title: "Music, Art; Fun", start: "2026-08-20", description: "One\nTwo" }, STAMP);
  assert.ok(html.indexOf("SUMMARY:Music\\, Art\\; Fun") >= 0);
  assert.ok(html.indexOf("One\\nTwo") >= 0);
});
test("the description points back at the organizer, because a saved file cannot update itself", () => {
  assert.ok(t.icsForEvent(TIMED, STAMP).indexOf("Confirm with the organizer") >= 0);
});
test("an unparseable start produces no file rather than a wrong one", () => {
  assert.equal(t.icsForEvent({ id: "x", title: "Mystery", start: "sometime soon" }, STAMP), "");
});
test("the download filename is derived from the title", () => {
  assert.equal(t.icsFileName(TIMED), "boulder-creek-book-group.ics");
  assert.equal(t.icsFileName({ title: "" }), "event.ics");
});
test("an event card offers the calendar button once the event has an id", () => {
  const card = t.eventCard(Object.assign({}, TIMED));
  assert.ok(card.indexOf('data-ics="bclev1"') >= 0);
  assert.ok(card.indexOf("Add to calendar") >= 0);
  assert.equal(card.indexOf("undefined"), -1);
});

/* Ranges. Reference "today" is Wednesday 2026-07-29. */
const WED = new Date(2026, 6, 29, 9, 0);
const inRange = (start, opts) => t.eventInRange({ start: start }, Object.assign({ today: WED }, opts));

test("All upcoming keeps everything", () => {
  assert.equal(inRange("2026-07-29", { range: "all" }), true);
  assert.equal(inRange("2026-12-25", { range: "all" }), true);
});
test("Today is only today", () => {
  assert.equal(inRange("2026-07-29T18:00", { range: "today" }), true);
  assert.equal(inRange("2026-07-30", { range: "today" }), false);
});
test("This weekend is the coming Friday through Sunday", () => {
  assert.equal(inRange("2026-07-31", { range: "weekend" }), true, "Friday");
  assert.equal(inRange("2026-08-02", { range: "weekend" }), true, "Sunday");
  assert.equal(inRange("2026-07-30", { range: "weekend" }), false, "Thursday");
  assert.equal(inRange("2026-08-03", { range: "weekend" }), false, "the Monday after");
});
test("Next 7 and next 30 days count forward from today", () => {
  assert.equal(inRange("2026-08-05", { range: "7" }), true);
  assert.equal(inRange("2026-08-06", { range: "7" }), false);
  assert.equal(inRange("2026-08-28", { range: "30" }), true);
  assert.equal(inRange("2026-09-01", { range: "30" }), false);
  assert.equal(inRange("2026-07-28", { range: "7" }), false, "never looks backwards");
});
test("a custom range honours one open end", () => {
  assert.equal(inRange("2026-09-05", { range: "custom", from: "2026-09-01", to: "2026-09-30" }), true);
  assert.equal(inRange("2026-10-05", { range: "custom", from: "2026-09-01", to: "2026-09-30" }), false);
  assert.equal(inRange("2026-12-01", { range: "custom", from: "2026-09-01", to: "" }), true);
  assert.equal(inRange("2026-08-01", { range: "custom", from: "", to: "2026-08-31" }), true);
  assert.equal(inRange("2026-09-01", { range: "custom", from: "", to: "2026-08-31" }), false);
});
test("boundary days are inside the custom range", () => {
  assert.equal(inRange("2026-09-01", { range: "custom", from: "2026-09-01", to: "2026-09-30" }), true);
  assert.equal(inRange("2026-09-30", { range: "custom", from: "2026-09-01", to: "2026-09-30" }), true);
});
