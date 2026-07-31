const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");

const DATA = path.join(__dirname, "..", "..", "data", "rain.json");
const payload = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : null;

/* A trimmed synthetic payload, so the logic tests do not depend on a refresh
   having been run. Shapes match rain/refresh_rain.py exactly. */
function flat(v) { return new Array(t.RAIN_WY_DAYS).fill(v); }
function ramp(perDay) {
  return Array.from({ length: t.RAIN_WY_DAYS }, (_, i) => Math.round(perDay * (i + 1) * 100) / 100);
}
const FAKE = {
  updated: "2026-07-29",
  generated_at: "2026-07-29T15:37:00-07:00",
  station: { id: "USC00040673", name: "Ben Lomond No. 4", elevation_ft: 435, record_starts: "1937" },
  record: {
    reportable_years: 3, first_reportable: 2001, last_reportable: 2003,
    first_water_year: 2000, last_water_year: 2026, mean: 40.0, median: 30.0,
    wettest_day: { date: "1982-01-04", inches: 11.47 }
  },
  totals: { 2001: 20.0, 2002: 30.0, 2003: 70.0 },
  wettest: [{ wy: 2003, inches: 70.0, rank: 1 }],
  driest: [{ wy: 2001, inches: 20.0, rank: 1 }],
  excluded: [{ wy: 2000, missing: 40, inches: 12.5, accumulated: 0, partial: false },
             { wy: 2026, missing: 2, inches: 44.97, accumulated: 0, partial: true }],
  band: { p10: ramp(0.05), p25: ramp(0.07), p50: ramp(0.1), p75: ramp(0.15), p90: ramp(0.2) },
  current: {
    wy: 2026, to_date: 44.97, through: "2026-07-29", day_index: 302,
    missing_days: 2, accumulated_days: 0, gaps: ["2026-06-02", "2026-07-07"],
    wet_season_gaps: 0, normal_to_date: 30.2, drier_years_to_date: 2, years_compared: 3,
    cumulative: ramp(0.149).slice(0, 302),
    storms: [{ start: "2026-02-15", end: "2026-02-20", days: 6, inches: 7.4, wettest_day: 2.75, incomplete: false }],
    wettest_day: { date: "2026-02-17", inches: 2.75 }
  }
};

/* ------------------------------------------------------------ water years */

test("the canonical water year is 365 days from October 1", () => {
  assert.equal(t.RAIN_WY_DAYS, 365);
  assert.equal(t.rainWaterYearDay("2025-10-01"), 1);
  assert.equal(t.rainWaterYearDay("2026-09-30"), 365);
  const starts = t.rainMonthStarts();
  assert.deepEqual(starts.map(m => m.start), [1, 32, 62, 93, 124, 152, 183, 213, 244, 274, 305, 336]);
  assert.equal(starts[starts.length - 1].end, 365);
});
test("October 1 begins the water year that is named for the following year", () => {
  assert.equal(t.rainWaterYear("2025-09-30"), 2025);
  assert.equal(t.rainWaterYear("2025-10-01"), 2026);
  assert.equal(t.rainWaterYear("nonsense"), null);
});
test("the leap day shares February 28's slot, matching the Python side", () => {
  assert.equal(t.rainWaterYearDay("2024-02-29"), t.rainWaterYearDay("2024-02-28"));
});

/* ------------------------------------------------- Pacific time, per date */

test("the Pacific day is computed for the date, not by a fixed UTC offset", () => {
  /* 2026-07-02 06:30Z is still July 1 in PDT (-7); 2026-11-30 07:30Z is still
     November 29 in PST (-8). A hardcoded offset gets exactly one of these right,
     which is the bug swept out of the portfolio on 2026-07-29. */
  assert.equal(t.rainPacificDay(new Date("2026-07-02T06:30:00Z")), "2026-07-01");
  assert.equal(t.rainPacificDay(new Date("2026-11-30T07:30:00Z")), "2026-11-29");
  assert.equal(t.rainPacificDay(new Date("2026-11-30T08:30:00Z")), "2026-11-30");
});
test("the Pacific day is independent of the reader's own timezone", () => {
  const at = new Date("2026-01-15T20:00:00Z");
  assert.equal(t.rainPacificDay(at), "2026-01-15");
});

/* ------------------------------------------------------------- freshness */

test("freshness tracks the gauge and the file on separate clocks", () => {
  const f = t.rainFreshness(FAKE, "2026-07-31");
  assert.equal(f.through, "2026-07-29");
  assert.equal(f.observationAge, 2);
  assert.equal(f.fileAge, 2);
  assert.equal(f.behind, false);
});
test("a gauge that has stopped reporting is called behind, not dry", () => {
  const f = t.rainFreshness(FAKE, "2026-08-20");
  assert.equal(f.behind, true);
  const html = t.rainFreshnessHTML(FAKE, "2026-08-20");
  assert.ok(html.indexOf("The gauge record is behind") >= 0);
  assert.ok(html.indexOf("not that it has stopped raining") >= 0);
  assert.ok(html.indexOf("weather.gov") >= 0 && html.indexOf("/mountain-status") >= 0);
});
test("the reading date and its age are both printed", () => {
  const html = t.rainFreshnessHTML(FAKE, "2026-07-30");
  assert.ok(html.indexOf("LAST READING AT THE GAUGE JUL 29, 2026") >= 0);
  assert.ok(html.indexOf("YESTERDAY") >= 0);
  assert.ok(html.indexOf("RECORD REBUILT JUL 29, 2026") >= 0);
});
test("when the browser cannot resolve Pacific time the age is omitted, not guessed", () => {
  const html = t.rainFreshnessHTML(FAKE, null);
  assert.ok(html.indexOf("LAST READING AT THE GAUGE JUL 29, 2026") >= 0);
  assert.equal(html.indexOf("DAYS AGO"), -1);
  assert.equal(html.indexOf("undefined"), -1);
});
test("age words read like a person wrote them", () => {
  assert.equal(t.rainAgeWords(0), "today");
  assert.equal(t.rainAgeWords(1), "yesterday");
  assert.equal(t.rainAgeWords(9), "9 days ago");
  assert.equal(t.rainAgeWords(null), "");
});

/* ------------------------------------------------------------------- gaps */

test("a season total containing a gap is called a floor, never a total", () => {
  const note = t.rainGapNote(FAKE.current);
  assert.ok(note.indexOf("floor rather than a full total") >= 0);
  assert.ok(note.indexOf("the true figure is at least that much") >= 0);
  assert.ok(note.indexOf("Jun 2, 2026") >= 0, "the gap dates are named");
});
test("summer gaps and wet-season gaps are described differently", () => {
  assert.ok(t.rainGapNote(FAKE.current).indexOf("outside the wet half of the year") >= 0);
  const wet = Object.assign({}, FAKE.current, { gaps: ["2026-01-20"], missing_days: 1, wet_season_gaps: 1 });
  const note = t.rainGapNote(wet);
  assert.ok(note.indexOf("One gap falls") >= 0);
  assert.ok(note.indexOf("a single missed day can cost inches") >= 0);
});
test("a complete year is allowed to say so", () => {
  const clean = Object.assign({}, FAKE.current, { gaps: [], missing_days: 0, wet_season_gaps: 0 });
  assert.ok(t.rainGapNote(clean).indexOf("complete total") >= 0);
});
test("an accumulated reading is disclosed rather than hidden", () => {
  const acc = Object.assign({}, FAKE.current, { accumulated_days: 1 });
  assert.ok(t.rainGapNote(acc).indexOf("multi-day accumulated total") >= 0);
});

/* --------------------------------------------------------- season summary */

test("season to date is compared as a count of years, not a smooth percentile", () => {
  assert.equal(t.rainRankText(2, 3), "wetter than 2 of 3 years by this date");
  assert.equal(t.rainRankText(0, 67), "the driest start to a year in the record");
  assert.equal(t.rainRankText(67, 67), "the wettest start to a year in the record");
  assert.equal(t.rainRankText(null, 67), "");
});
test("the summary carries the comparison the tiles print", () => {
  const s = t.rainSeasonSummary(FAKE);
  assert.equal(s.toDate, 44.97);
  assert.equal(s.normal, 30.2);
  assert.equal(s.pctOfNormal, 149);
  assert.equal(s.floor, true);
});
test("a season total with a gap is shown as 'or more' on the tile", () => {
  const html = t.rainStatsHTML(FAKE);
  assert.ok(html.indexOf("44.97 in or more") >= 0);
  assert.ok(html.indexOf("Median by this date") >= 0);
  assert.equal(html.indexOf("undefined"), -1);
  assert.equal(html.indexOf("NaN"), -1);
});

/* The tiles must NAME the statistic. Calling a right-skewed record's median
   "typical" read as an outright error to the owner, who knows the local figure
   is nearer 50: the median is 42.69 while the mean is 49.09. Guard both halves,
   the honest label and the mean being shown next to it. */
test("the tiles say median rather than typical, and print the mean beside it", () => {
  const html = t.rainStatsHTML(FAKE);
  assert.ok(html.indexOf("Median full water year") >= 0);
  assert.equal(html.indexOf("Typical"), -1, "no tile may call a median 'typical'");
  assert.ok(html.indexOf("The average is") >= 0, "the mean has to appear beside the median");
});

test("the skew note counts the wet years instead of asserting a fraction", () => {
  // A hardcoded "a fifth of years" was wrong on the first draft: it is nearer a
  // third. Derive it, so the prose cannot drift from the record.
  const note = t.rainSkewNote(FAKE);
  const big = Object.values(FAKE.totals).filter((v) => v > 60).length;
  const n = Object.keys(FAKE.totals).length;
  if (big) assert.ok(note.indexOf(big + " of " + n + " topped 60 inches") >= 0, note);
  // Degrade rather than invent when the record block is absent.
  assert.equal(t.rainSkewNote({}), "");
  assert.equal(t.rainSkewNote(null), "");
});
test("with no gaps the tile drops the qualifier", () => {
  const clean = Object.assign({}, FAKE, { current: Object.assign({}, FAKE.current, { missing_days: 0 }) });
  const html = t.rainStatsHTML(clean);
  assert.ok(html.indexOf("44.97 in<") >= 0);
  assert.equal(html.indexOf("or more"), -1);
});

/* --------------------------------------------------------------- lookups */

test("a reportable year reports its rank from whichever end is closer", () => {
  assert.equal(t.rainLookupMessage(t.rainYearLookup(FAKE, 2003)),
    "Water year 2003: 70.00 in, 1st wettest of the 3 reportable years, 233 percent of the median year.");
  assert.equal(t.rainLookupMessage(t.rainYearLookup(FAKE, 2001)),
    "Water year 2001: 20.00 in, 1st driest of the 3 reportable years, 67 percent of the median year.");
});
test("an excluded year says why, and its total is called a floor", () => {
  const msg = t.rainLookupMessage(t.rainYearLookup(FAKE, 2000));
  assert.ok(msg.indexOf("not reportable") >= 0);
  assert.ok(msg.indexOf("40 days have no reading") >= 0);
  assert.ok(msg.indexOf("floor, not a total") >= 0);
  assert.ok(msg.indexOf("rather than estimated") >= 0);
});
test("the year in progress is excluded for being unfinished, not for gaps", () => {
  const msg = t.rainLookupMessage(t.rainYearLookup(FAKE, 2026));
  assert.ok(msg.indexOf("not finished yet") >= 0);
});
test("a year outside the record is refused rather than invented", () => {
  assert.equal(t.rainLookupMessage(t.rainYearLookup(FAKE, 1850)),
    "Water year 1850 is not in this record.");
  assert.equal(t.rainYearLookup(FAKE, ""), null);
});
test("ordinals read correctly, including the teens", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(t.rainOrdinal),
    ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
});

/* ---------------------------------------------------------------- charts */

test("the season chart uses the one validated hue and neutral context bands", () => {
  const svg = t.rainSeasonChart(FAKE);
  assert.ok(svg.indexOf('stroke="#2a7d55" stroke-width="2"') >= 0, "this year is the 2px accent line");
  assert.ok(svg.indexOf('fill="#eae6d8"') >= 0 && svg.indexOf('fill="#d9d4c2"') >= 0,
    "history is neutral, not a second hue");
  assert.equal(svg.indexOf("#2f6754"), -1, "the brand fern fails the chroma floor");
  assert.equal(svg.indexOf("#d56e47"), -1, "clay beside green fails protanopia separation");
});
test("the season chart labels only the endpoint, and never clips it", () => {
  const svg = t.rainSeasonChart(FAKE);
  const labels = svg.match(/font-variant-numeric:tabular-nums">[\d.]+ in</g) || [];
  assert.equal(labels.length, 1, "exactly one direct value label");
  assert.ok(svg.indexOf('text-anchor="end"') >= 0, "past mid-chart the label flips inward");
  const early = Object.assign({}, FAKE, {
    current: Object.assign({}, FAKE.current, { cumulative: FAKE.current.cumulative.slice(0, 40) })
  });
  assert.ok(t.rainSeasonChart(early).indexOf('text-anchor="start"') >= 0, "early in the season it points outward");
});
test("the season chart is accessible and self-describing", () => {
  const svg = t.rainSeasonChart(FAKE);
  assert.ok(svg.indexOf('role="img"') >= 0 && svg.indexOf("aria-label=") >= 0);
  assert.ok(svg.indexOf("<desc>") >= 0);
  assert.ok(svg.indexOf("Years missing more than five days") >= 0);
  assert.equal(svg.indexOf("undefined"), -1);
  assert.equal(svg.indexOf("NaN"), -1);
});
test("every month carries a native tooltip so hovering needs no script", () => {
  const svg = t.rainSeasonChart(FAKE);
  const tips = svg.match(/<rect[^>]*fill="transparent"><title>/g) || [];
  assert.equal(tips.length, 12);
  assert.ok(svg.indexOf("season total") >= 0 && svg.indexOf("typical") >= 0);
});
test("months with no reading yet say so instead of showing zero", () => {
  const early = Object.assign({}, FAKE, {
    current: Object.assign({}, FAKE.current, { cumulative: FAKE.current.cumulative.slice(0, 40) })
  });
  assert.ok(t.rainSeasonChart(early).indexOf("no reading yet") >= 0);
  assert.ok(t.rainMonthTable(early).indexOf("no reading yet") >= 0);
});
test("a malformed band produces no chart rather than a misleading one", () => {
  assert.equal(t.rainSeasonChart({ band: { p50: [1, 2, 3] }, current: {} }), "");
  assert.equal(t.rainSeasonChart(null), "");
  assert.equal(t.rainMonthTable(null), "");
});
test("the totals chart draws one bar per reportable year in a single hue", () => {
  const svg = t.rainTotalsChart(FAKE, "all", null);
  const bars = svg.match(/fill="#2a7d55"><title>/g) || [];
  assert.equal(bars.length, 3);
  assert.ok(svg.indexOf("median 30") >= 0 && svg.indexOf("mean 40") >= 0);
  assert.ok(svg.indexOf("Water year 2003: 70.00 inches") >= 0);
});
test("a looked-up year is marked by a label, never by recolouring its bar", () => {
  const plain = t.rainTotalsChart(FAKE, "all", null);
  const picked = t.rainTotalsChart(FAKE, "all", 2002);
  assert.equal((picked.match(/fill="#2a7d55"><title>/g) || []).length,
    (plain.match(/fill="#2a7d55"><title>/g) || []).length,
    "the bar count and colour are unchanged");
  assert.equal(picked.match(/fill="#[0-9a-f]{6}"><title>/g).length, 3);
  assert.ok(picked.indexOf(">2002<") >= 0 || picked.indexOf("2002: 30") >= 0);
});
test("the totals chart caps bar thickness instead of filling the slot", () => {
  const wide = t.rainTotalsChart({
    totals: { 2003: 70.0 }, record: { median: 30, mean: 40 }
  }, "all", null);
  const width = /M([\d.]+),\d+\.\d L\1/.exec(wide);
  assert.ok(wide.indexOf("<path") >= 0);
  const xs = (wide.match(/M([\d.]+),/g) || []).map(s => parseFloat(s.slice(1)));
  const ends = (wide.match(/L([\d.]+),\d+\.\d Z/g) || []).map(s => parseFloat(s.slice(1)));
  assert.ok(ends[0] - xs[0] <= 24.01, "bars are capped at 24px, got " + (ends[0] - xs[0]));
});
test("the recent scope shows at most twenty years", () => {
  const many = { totals: {}, record: { median: 30, mean: 40 } };
  for (let y = 1940; y <= 2023; y++) many.totals[y] = 40 + (y % 7);
  assert.equal((t.rainTotalsChart(many, "recent", null).match(/><title>/g) || []).length, 20);
  assert.equal((t.rainTotalsChart(many, "all", null).match(/><title>/g) || []).length, 84);
});
test("an empty totals set produces no chart", () => {
  assert.equal(t.rainTotalsChart({ totals: {} }, "all", null), "");
  assert.equal(t.rainTotalsChart(null, "all", null), "");
});

/* --------------------------------------------------------------- controls */

test("the controls row holds only label-and-control pairs plus a full-width message", () => {
  const html = t.rainControlsHTML(FAKE, "");
  const fields = html.match(/class="bcl-rain-field"/g) || [];
  assert.equal(fields.length, 2);
  /* Every field contains exactly one label and one control, and the status
     message is a sibling of the fields, not a child of one of them. */
  fields.forEach(() => {});
  const inner = html.slice(html.indexOf('class="bcl-rain-field"'), html.lastIndexOf("</select></div>") + 15);
  assert.equal(inner.indexOf("bcl-rain-msg"), -1, "the message must not sit inside a control group");
  assert.ok(html.indexOf('<p class="bcl-rain-msg"') >= 0);
  assert.ok(html.indexOf('role="status" aria-live="polite"') >= 0);
});
test("the controls row survives its FILLED state, which is the one that breaks", () => {
  /* An aria-live region is invisible until it is not. Filled, the message is
     still a sibling after the last field, so flex-end alignment cannot pull
     the selects to different heights. */
  const msg = t.rainLookupMessage(t.rainYearLookup(FAKE, 2003));
  const html = t.rainControlsHTML(FAKE, msg);
  assert.ok(html.indexOf(">Water year 2003: 70.00 in") >= 0);
  const lastField = html.lastIndexOf("</select></div>");
  assert.ok(html.indexOf('<p class="bcl-rain-msg"') > lastField,
    "the message comes after both fields, as a sibling");
  assert.ok(html.indexOf("</p></div>") >= 0, "and closes inside the row, not inside a field");
});
test("every year in the record is selectable, with the unreportable ones marked", () => {
  const html = t.rainControlsHTML(FAKE, "");
  assert.ok(html.indexOf('<option value="2003">2003</option>') >= 0);
  assert.ok(html.indexOf('<option value="2000">2000 (not reportable)</option>') >= 0);
  assert.ok(html.indexOf('<option value="2026">2026 (not reportable)</option>') >= 0);
});
test("labels are bound to their controls by id", () => {
  const html = t.rainControlsHTML(FAKE, "");
  ["bcl-rain-year", "bcl-rain-scope"].forEach(id => {
    assert.ok(html.indexOf('for="' + id + '"') >= 0, id);
    assert.ok(html.indexOf('id="' + id + '"') >= 0, id);
  });
});

/* ------------------------------------------------------- storms & method */

test("storms are listed with their dates and totals", () => {
  const html = t.rainStormsHTML(FAKE);
  assert.ok(html.indexOf("Feb 15, 2026 to Feb 20, 2026") >= 0);
  assert.ok(html.indexOf("7.40") >= 0);
  assert.ok(html.indexOf("<caption>") >= 0);
});
test("a storm total interrupted by a missing day is flagged as incomplete", () => {
  const gappy = Object.assign({}, FAKE, {
    current: Object.assign({}, FAKE.current, {
      storms: [{ start: "2026-02-15", end: "2026-02-16", days: 2, inches: 1.2, wettest_day: 0.8, incomplete: true }]
    })
  });
  assert.ok(t.rainStormsHTML(gappy).indexOf("total incomplete") >= 0);
});
test("no storms yet is stated plainly, and the gap caveat rides along", () => {
  const none = Object.assign({}, FAKE, {
    current: Object.assign({}, FAKE.current, { storms: [] })
  });
  const html = t.rainStormsHTML(none);
  assert.ok(html.indexOf("has yet totalled half an inch") >= 0);
  assert.ok(html.indexOf("among the days that were recorded") >= 0);
});
test("the method section names the excluded years instead of hiding them", () => {
  const html = t.rainMethodHTML(FAKE);
  assert.ok(html.indexOf("five or fewer days with no reading") >= 0);
  assert.ok(html.indexOf("2000") >= 0, "the excluded year is named");
  assert.ok(html.indexOf("rather than patched") >= 0);
  assert.ok(html.indexOf("median is the better number") >= 0);
});
test("the method section keeps the median-versus-mean point", () => {
  const html = t.rainMethodHTML(FAKE);
  assert.ok(html.indexOf("30.00 in") >= 0 && html.indexOf("40.00 in") >= 0);
});

/* ---------------------------------------------- brand rules, on every string */

test("no em-dash, no emoji and no AI-tell phrasing anywhere the tool speaks", () => {
  const strings = [
    t.rainFreshnessHTML(FAKE, "2026-07-30"), t.rainFreshnessHTML(FAKE, "2026-08-20"),
    t.rainGapNote(FAKE.current), t.rainStatsHTML(FAKE), t.rainSeasonChart(FAKE),
    t.rainSeasonLegendHTML(FAKE), t.rainMonthTable(FAKE), t.rainTotalsChart(FAKE, "all", 2002),
    t.rainExtremesHTML(FAKE), t.rainStormsHTML(FAKE), t.rainControlsHTML(FAKE, "x"),
    t.rainMethodHTML(FAKE), t.rainLookupMessage(t.rainYearLookup(FAKE, 2000))
  ].join("\n");
  assert.equal(strings.indexOf("—"), -1, "em-dash");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(strings), "emoji");
  ["the honest truth", "let's be honest", "to be honest", "honest heads-up", "dive into",
    "deep dive", "a testament to", "boasts", "here's the thing", "elevate your",
    "the beauty of"].forEach(tell => {
    assert.equal(strings.toLowerCase().indexOf(tell), -1, "AI tell: " + tell);
  });
});

test("the tool never converts the record into a condition or an all-clear", () => {
  const strings = [
    t.rainGapNote(FAKE.current), t.rainStatsHTML(FAKE), t.rainStormsHTML(FAKE),
    t.rainFreshnessHTML(FAKE, "2026-08-20"), t.rainMethodHTML(FAKE),
    t.rainLookupMessage(t.rainYearLookup(FAKE, 2001))
  ].join("\n").toLowerCase();
  ["all clear", "all-clear", "safe", "no drought", "no flood", "fire danger is",
    "you can expect", "there is no risk"].forEach(word => {
    assert.equal(strings.indexOf(word), -1, "must not say: " + word);
  });
});

test("the tool points at Mountain Status for live conditions and never replaces it", () => {
  const html = t.rainFreshnessHTML(FAKE, "2026-07-30") + t.rainMethodHTML(FAKE);
  assert.ok(html.indexOf('href="/mountain-status"') >= 0);
  assert.ok(html.indexOf("not a forecast") >= 0);
});

/* --------------------------------------- the generated payload, if present */

test("the generated payload agrees with the rainfall article", (tc) => {
  if (!payload) return tc.skip("data/rain.json not generated yet");
  assert.equal(payload.totals["2021"], 21.51);
  assert.equal(payload.totals["2023"], 85.13);
  assert.equal(payload.record.reportable_years, 67);
  assert.equal(payload.record.mean, 49.09);
  assert.equal(payload.record.median, 42.69);
});
test("the generated payload renders every section without holes", (tc) => {
  if (!payload) return tc.skip("data/rain.json not generated yet");
  const html = [
    t.rainFreshnessHTML(payload, "2026-07-29"), t.rainStatsHTML(payload),
    t.rainGapNote(payload.current), t.rainSeasonChart(payload),
    t.rainSeasonLegendHTML(payload), t.rainMonthTable(payload),
    t.rainControlsHTML(payload, t.rainLookupMessage(t.rainYearLookup(payload, 2017))),
    t.rainTotalsChart(payload, "all", 2017), t.rainExtremesHTML(payload),
    t.rainStormsHTML(payload), t.rainMethodHTML(payload)
  ].join("\n");
  assert.equal(html.indexOf("undefined"), -1);
  assert.equal(html.indexOf("NaN"), -1);
  assert.equal(html.indexOf("null"), -1);
  assert.ok(html.indexOf("2nd wettest of the 67 reportable years") >= 0, "WY2017 ranking");
});
test("the payload stays small enough to fetch on page load", (tc) => {
  if (!payload) return tc.skip("data/rain.json not generated yet");
  assert.ok(fs.statSync(DATA).size < 120000, "rain.json is " + fs.statSync(DATA).size + " bytes");
});
