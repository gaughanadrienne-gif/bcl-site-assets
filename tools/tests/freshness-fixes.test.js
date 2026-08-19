/* Regression tests for the 2026-08-19 freshness/trust fixes:
   homepage event span semantics, Caltrans card dedupe, river reading age,
   and the article date repair. All helpers take an explicit "now" so the
   tests do not rot. */

const test = require("node:test");
const assert = require("node:assert");
const T = require("../bcl-tools.js");

/* ---------- homepage "Happening next": an event is a span ---------- */

const EXHIBIT = { id: "x1", title: "Valley Sketchbook exhibit", start: "2026-07-16", end: "2026-09-20", location: "Felton, CA" };
const EXHIBIT2 = { id: "x2", title: "Redwood photography show", start: "2026-07-01", end: "2026-12-31" };
const SOON = { id: "s1", title: "Farmers market", start: "2026-08-21", end: "2026-08-21" };

test("an already-open run is labelled by when it closes, not when it opened", () => {
  const today = new Date(2026, 7, 18); // Aug 18, 2026
  const row = T.homeEventRow(EXHIBIT, today);
  assert.ok(row.includes("THROUGH SEP 20"), row);
  assert.ok(!row.includes("JUL 16"), "the past start date must not reach the homepage card");
});

test("a not-yet-started event still shows its start date", () => {
  const today = new Date(2026, 7, 18);
  const row = T.homeEventRow(SOON, today);
  assert.ok(row.includes("AUG 21"), row);
  assert.ok(!row.includes("THROUGH"), row);
});

test("nextEvents keeps ongoing runs together at the front, ordered by close date", () => {
  const rows = T.nextEvents([SOON, EXHIBIT2, EXHIBIT], "2026-08-18", 3, new Date(2026, 7, 18));
  assert.deepEqual(rows.map((e) => e.id), ["x1", "x2", "s1"]);
});

test("an event is only dropped after its END date", () => {
  const onLastDay = T.nextEvents([EXHIBIT], "2026-09-20", 3, new Date(2026, 8, 20));
  assert.equal(onLastDay.length, 1, "an exhibit open today must not be suppressed");
  const dayAfter = T.nextEvents([EXHIBIT], "2026-09-21", 3, new Date(2026, 8, 21));
  assert.equal(dayAfter.length, 0);
});

/* ---------- Mountain Status: duplicate closure cards ---------- */

function lcs(route, place, type, delay) {
  return {
    location: { begin: { beginRoute: route, beginNearbyPlace: place, beginCounty: "Santa Cruz" } },
    closure: { typeOfClosure: type, estimatedDelay: delay }
  };
}

test("two closure records that render the same sentence collapse to one card", () => {
  /* The real case, 2026-08-18: Caltrans closure C9LA logs 17 and 18. */
  const rows = [
    lcs("SR-9", "Boulder Creek", "Alternating Lanes", "5"),
    lcs("SR-9", "Boulder Creek", "Alternating Lanes", "5")
  ];
  assert.equal(T.dedupeCaltrans(rows).length, 1);
});

test("closures a reader can tell apart are all kept", () => {
  const rows = [
    lcs("SR-9", "Boulder Creek", "Alternating Lanes", "5"),
    lcs("SR-9", "Brookdale", "One-Way Traffic", "Not Reported"),
    lcs("SR-236", "Boulder Creek", "One-Way Traffic", "5"),
    lcs("SR-9", "Boulder Creek", "Full", "5")
  ];
  assert.equal(T.dedupeCaltrans(rows).length, 4);
});

test("a delay that is not a number does not split an otherwise identical pair", () => {
  const rows = [
    lcs("SR-1", "Capitola", "Full", "Not Reported"),
    lcs("SR-1", "Capitola", "Full", "0")
  ];
  assert.equal(T.dedupeCaltrans(rows).length, 1, "neither delay is printed, so both cards read alike");
});

/* ---------- river gauge: the age of the reading ---------- */

test("a reading from two days ago is flagged as not current", () => {
  const age = T.riverAge("2026-08-16T09:00:00-07:00", new Date("2026-08-18T09:00:00-07:00"));
  assert.equal(age.stale, true);
  assert.equal(age.words, "2 days old");
});

test("a fresh reading is not flagged", () => {
  const age = T.riverAge("2026-08-18T08:30:00-07:00", new Date("2026-08-18T09:00:00-07:00"));
  assert.equal(age.stale, false);
  assert.equal(age.words, "less than an hour old");
});

test("the stale card says so out loud and the fresh one does not", () => {
  const stale = T.riverAgeHTML("2026-08-16T09:00:00-07:00", new Date("2026-08-18T09:00:00-07:00"));
  assert.ok(stale.includes("Not current"), stale);
  assert.ok(stale.includes("2 days old"), stale);
  const fresh = T.riverAgeHTML("2026-08-18T08:30:00-07:00", new Date("2026-08-18T09:00:00-07:00"));
  assert.ok(!fresh.includes("Not current"), fresh);
  assert.ok(fresh.includes("Reading from"), fresh);
});

test("a reading with no timestamp says its age is unknown rather than nothing", () => {
  assert.equal(T.riverAge("", new Date()), null);
  assert.ok(T.riverAgeHTML("", new Date()).includes("no timestamp"));
});

test("the whole river card carries the age", () => {
  const html = T.riverCardHTML(
    { stage: 1.42, flow: 12, at: "2026-08-16T09:00:00-07:00", provisional: true },
    [],
    new Date("2026-08-18T09:00:00-07:00")
  );
  assert.ok(html.includes("Not current"), html);
  assert.ok(html.includes("Provisional data"), html);
});

/* ---------- article dates carry the year ---------- */

test("the visible article date is built from the JSON-LD, with its year", () => {
  const parts = { y: 2026, mo: 2, d: 19 };
  assert.equal(T.articleDateText(parts), "February 19, 2026");
});

test("the JSON-LD reader finds the BlogPosting date and ignores the WebSite node", () => {
  const scripts = [
    { textContent: JSON.stringify({ "@type": "WebSite", url: "https://www.bouldercreeklocal.com" }) },
    { textContent: JSON.stringify({ "@type": "BlogPosting", datePublished: "2026-02-19T04:00:00-0800" }) }
  ];
  const fake = { querySelectorAll: () => scripts };
  assert.deepEqual(T.articleDateFromLD(fake), { y: 2026, mo: 2, d: 19, iso: "2026-02-19" });
});

test("a page with no article JSON-LD is left alone", () => {
  const fake = { querySelectorAll: () => [{ textContent: "not json at all" }] };
  assert.equal(T.articleDateFromLD(fake), null);
});

/* ---------- analytics ---------- */

test("a download file name survives query strings and CDN paths", () => {
  assert.equal(
    T.downloadNameFromHref("https://cdn.jsdelivr.net/gh/x/y@main/downloads/Boulder_Creek_Wildfire_Go_Bag_Checklist.pdf?v=2"),
    "Boulder_Creek_Wildfire_Go_Bag_Checklist.pdf"
  );
});

test("tracking is a no-op with no gtag, and never throws", () => {
  assert.equal(T.track("directory_search", { search_term: "plumber" }), false);
});

test("tracked text is trimmed, single-spaced, and capped at the GA4 limit", () => {
  assert.equal(T.trackText("  tree   work  "), "tree work");
  assert.equal(T.trackText("x".repeat(200)).length, 100);
  assert.equal(T.trackText(null), "");
});
