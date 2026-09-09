"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bcl-tools.js"), "utf8");
const DATA = path.join(__dirname, "..", "..", "data");
const SPOTLIGHT = JSON.parse(fs.readFileSync(path.join(DATA, "spotlight.json"), "utf8"));
const LIVE_SLUGS = new Set(JSON.parse(fs.readFileSync(path.join(DATA, "live-article-slugs.json"), "utf8")));
const SCHEDULE_CSV = path.join(__dirname, "..", "..", "..", "..",
  "Social Media", "Blotato_2026_H2", "MASTER_SCHEDULE.csv");

/* ---------- the week boundary ----------
   THURSDAY, because every BCL-SPOT post in the social schedule is a Thursday and
   a business holds the card until the next one replaces it. This shipped on
   Wednesday first, from an assumption, and the owner corrected it. */

test("spotlightWeekStart: a Thursday owns its own week", () => {
  assert.equal(t.spotlightWeekStart("2026-09-10"), "2026-09-10");
  assert.equal(t.spotlightWeekStart("2026-09-17"), "2026-09-17");
});

test("spotlightWeekStart: Friday through Wednesday all fall back to the Thursday", () => {
  ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"]
    .forEach((day) => assert.equal(t.spotlightWeekStart(day), "2026-09-10", day));
  assert.equal(t.spotlightWeekStart("2026-09-17"), "2026-09-17");
});

test("spotlightWeekStart: rejects anything that is not a real calendar day", () => {
  [null, undefined, "", "2026-09", "09/09/2026", "2026-9-9", "not a date", 20260909,
    "2026-02-31", "2026-13-01", "2026-09-00"].forEach((bad) => {
    assert.equal(t.spotlightWeekStart(bad), null, JSON.stringify(bad));
  });
});

test("the boundary is Thursday 00:00 Pacific: Wednesday 23:59 is still last week", () => {
  // PDT is UTC-7 in September.
  const wedLate = t.rainPacificDay(new Date("2026-09-10T06:59:00Z"));  // Wed Sep 9, 23:59 PT
  const thuEarly = t.rainPacificDay(new Date("2026-09-10T07:01:00Z")); // Thu Sep 10, 00:01 PT
  assert.equal(wedLate, "2026-09-09");
  assert.equal(thuEarly, "2026-09-10");
  assert.equal(t.spotlightWeekStart(wedLate), "2026-09-03");
  assert.equal(t.spotlightWeekStart(thuEarly), "2026-09-10");
});

test("the boundary holds across the November DST change, when Pacific is UTC-8", () => {
  // A fixed -7 offset would flip these an hour early and move the changeover
  // onto the wrong calendar day for everyone reading late on a Wednesday.
  const wedLate = t.rainPacificDay(new Date("2026-11-12T07:59:00Z"));  // Wed Nov 11, 23:59 PST
  const thuEarly = t.rainPacificDay(new Date("2026-11-12T08:01:00Z")); // Thu Nov 12, 00:01 PST
  assert.equal(wedLate, "2026-11-11");
  assert.equal(thuEarly, "2026-11-12");
  assert.equal(t.spotlightWeekStart(wedLate), "2026-11-05");
  assert.equal(t.spotlightWeekStart(thuEarly), "2026-11-12");
});

test("the card is already flipped when a Thursday morning post lands", () => {
  // 09:00 Pacific is when BCL-SPOT-013 is scheduled. The card changed at midnight.
  const thu9am = t.rainPacificDay(new Date("2026-09-10T16:00:00Z"));
  assert.equal(thu9am, "2026-09-10");
  assert.equal(t.spotlightWeekStart(thu9am), "2026-09-10");
});

test("a reader outside Pacific sees the week Boulder Creek is in, not their own", () => {
  // Thursday noon in Tokyo is still Wednesday evening in Boulder Creek, so this
  // reader correctly gets the OUTGOING business until the Pacific boundary passes.
  const tokyoThuNoon = new Date("2026-09-10T03:00:00Z");
  assert.equal(t.rainPacificDay(tokyoThuNoon), "2026-09-09");
  assert.equal(t.spotlightWeekStart(t.rainPacificDay(tokyoThuNoon)), "2026-09-03");
  // Thursday early evening in London is already Thursday morning here.
  const londonThuEvening = new Date("2026-09-10T17:00:00Z");
  assert.equal(t.rainPacificDay(londonThuEvening), "2026-09-10");
  assert.equal(t.spotlightWeekStart(t.rainPacificDay(londonThuEvening)), "2026-09-10");
});

/* ---------- picking the current business ---------- */

const ORDER = {
  schedule: [
    { week: "2026-09-03", slug: "one-boulder-creek", business: "One", blurb: "First." },
    { week: "2026-09-10", slug: "two-boulder-creek", business: "Two", blurb: "Second." },
    // Deliberate two-week gap, exactly like the owner's real running order.
    { week: "2026-09-24", slug: "three-boulder-creek", business: "Three", blurb: "Third." },
  ],
};

test("spotlightPick: the business holds from its Thursday to the next one", () => {
  ["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-16"].forEach((day) => {
    assert.equal(t.spotlightPick(ORDER, day).business, "Two", day);
  });
  assert.equal(t.spotlightPick(ORDER, "2026-09-09").business, "One");
  assert.equal(t.spotlightPick(ORDER, "2026-09-24").business, "Three");
});

test("spotlightPick: a GAP in the running order holds the previous business", () => {
  // This is the behaviour that matters: the spotlight on social is still Two, so
  // the homepage must still say Two rather than blinking out for a fortnight.
  ["2026-09-17", "2026-09-20", "2026-09-23"].forEach((day) => {
    assert.equal(t.spotlightPick(ORDER, day).business, "Two", day);
  });
});

test("spotlightPick: order in the file does not matter, only the dates", () => {
  const shuffled = { schedule: [ORDER.schedule[2], ORDER.schedule[0], ORDER.schedule[1]] };
  assert.equal(t.spotlightPick(shuffled, "2026-09-16").business, "Two");
  assert.equal(t.spotlightPick(shuffled, "2026-09-30").business, "Three");
});

test("spotlightPick: an abandoned running order retires the card", () => {
  // 28 days after the last Thursday, "This week's business spotlight" is a false
  // label rather than a stale one, so it stops rendering.
  assert.equal(t.spotlightPick(ORDER, "2026-10-22").business, "Three"); // 28 days
  assert.equal(t.spotlightPick(ORDER, "2026-10-29"), null);             // 35 days
  assert.equal(t.spotlightPick(ORDER, "2027-01-07"), null);
});

test("spotlightPick: a running order that has not started yet returns nothing", () => {
  assert.equal(t.spotlightPick(ORDER, "2026-09-02"), null);
});

test("spotlightWeeksApart: whole days, and unparseable dates never look recent", () => {
  assert.equal(t.spotlightWeeksApart("2026-09-10", "2026-09-24"), 14);
  assert.equal(t.spotlightWeeksApart("2026-09-10", "2026-09-10"), 0);
  // Across the DST change, because both sides go through Date.UTC.
  assert.equal(t.spotlightWeeksApart("2026-10-29", "2026-11-12"), 14);
  assert.equal(t.spotlightWeeksApart("nope", "2026-09-10"), Infinity);
  assert.equal(t.spotlightWeeksApart("2026-09-10", "nope"), Infinity);
});

test("spotlightPick: missing or malformed data returns nothing", () => {
  const day = "2026-09-16";
  [null, undefined, "", 0, [], "a string", {}, { schedule: null }, { schedule: {} },
    { schedule: "2026-09-16" }, { weeks: ORDER.schedule }].forEach((bad) => {
    assert.equal(t.spotlightPick(bad, day), null, JSON.stringify(bad));
  });
  assert.equal(t.spotlightPick({ schedule: [] }, day), null);
});

test("spotlightPick: a row missing any field the card needs is skipped, not half-rendered", () => {
  const day = "2026-09-16";
  const good = ORDER.schedule[1];
  const broken = [
    { week: "2026-09-10", slug: "x-boulder-creek", business: "X" },              // no blurb
    { week: "2026-09-10", slug: "x-boulder-creek", blurb: "b" },                 // no business
    { week: "2026-09-10", business: "X", blurb: "b" },                           // no slug
    { slug: "x-boulder-creek", business: "X", blurb: "b" },                      // no week
    { week: "2026-09-10", slug: "x-boulder-creek", business: "  ", blurb: "b" }, // blank business
    { week: "2026-09-10", slug: "x-boulder-creek", business: "X", blurb: "  " }, // blank blurb
    { week: "not-a-date", slug: "x-boulder-creek", business: "X", blurb: "b" },
    null, "row", 7,
  ];
  broken.forEach((row) => assert.equal(t.spotlightPick({ schedule: [row] }, day), null, JSON.stringify(row)));
  // A broken row must not shadow the good one that should be showing.
  assert.equal(t.spotlightPick({ schedule: broken.concat([good]) }, day).business, "Two");
});

test("spotlightPick: a slug that is not a Squarespace slug shape is refused", () => {
  const day = "2026-09-16";
  ["../../data/directory.json", "a b", "UPPER", "slug?x=1", "/leading", "-leading", ""].forEach((slug) => {
    const row = { week: "2026-09-10", slug: slug, business: "X", blurb: "b" };
    assert.equal(t.spotlightPick({ schedule: [row] }, day), null, slug);
  });
});

test("spotlightPick: a date the browser could not resolve returns nothing", () => {
  assert.equal(t.spotlightPick(ORDER, null), null);
  assert.equal(t.spotlightPick(ORDER, "garbage"), null);
});

/* ---------- the article behind the slug ---------- */

const ITEM = {
  urlId: "two-boulder-creek",
  title: "Two: The Business",
  fullUrl: "/around-town/two-boulder-creek",
  assetUrl: "https://images.squarespace-cdn.com/content/v1/abc/two-boulder-creek.jpg",
};

test("spotlightItemIsUsable: the post has to be the one asked for and carry its own image", () => {
  assert.equal(t.spotlightItemIsUsable(ITEM, "two-boulder-creek"), true);
  assert.equal(t.spotlightItemIsUsable({ ...ITEM, urlId: "something-else" }, "two-boulder-creek"), false);
  assert.equal(t.spotlightItemIsUsable({ ...ITEM, assetUrl: "" }, "two-boulder-creek"), false);
  assert.equal(t.spotlightItemIsUsable({ urlId: "two-boulder-creek" }, "two-boulder-creek"), false);
  assert.equal(t.spotlightItemIsUsable(null, "two-boulder-creek"), false);
  assert.equal(t.spotlightItemIsUsable(undefined, "two-boulder-creek"), false);
});

test("spotlightCardHTML: kicker, business name, blurb, image and link all land", () => {
  const html = t.spotlightCardHTML(ORDER.schedule[1], ITEM);
  assert.match(html, /<span class="bcl-spot-kick">This week's business spotlight<\/span>/);
  assert.match(html, />Two</);
  assert.match(html, /Second\./);
  assert.match(html, /href="\/around-town\/two-boulder-creek"/);
  assert.match(html, /two-boulder-creek\.jpg\?format=1000w/);
  assert.match(html, /alt="Two: The Business"/);
  assert.match(html, /Read the spotlight/);
  assert.ok(!html.includes("undefined"));
  assert.ok(!html.includes("null"));
});

test("spotlightCardHTML: falls back to the slug path and does not double a query string", () => {
  const html = t.spotlightCardHTML(ORDER.schedule[1], { urlId: ITEM.urlId, assetUrl: "https://x/y.jpg?format=750w" });
  assert.match(html, /href="\/around-town\/two-boulder-creek"/);
  assert.match(html, /src="https:\/\/x\/y\.jpg\?format=750w"/);
  assert.ok(!html.includes("?format=750w?format="));
});

test("spotlightCardHTML: owner-typed copy is escaped, not injected", () => {
  const html = t.spotlightCardHTML(
    { slug: "x-boulder-creek", business: "<script>x</script>", blurb: "He said \"no\" & left" },
    { urlId: "x-boulder-creek", assetUrl: "https://x/y.jpg", title: "<b>T</b>" }
  );
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;no&quot; &amp; left/);
  assert.match(html, /alt="&lt;b&gt;T&lt;\/b&gt;"/);
});

/* ---------- rendering into the pre-placed shell ----------

   The section is created synchronously by initHome so its POSITION is fixed
   before any fetch resolves; initHomeSpotlight only fills it, or deletes it if
   there is nothing to show. That is what keeps it above the rain card without
   the two async inserts racing each other. */

function shellNode(bag) {
  return {
    id: "bcl-home-spotlight",
    className: "bcl-section",
    innerHTML: "",
    style: { display: "none" },
    querySelector: () => null,
    parentNode: {
      removeChild(node) { bag.removed.push(node); node.parentNode = null; },
      insertBefore: (n) => bag.appended.push(n),
    },
  };
}

function harness(routes) {
  const bag = { appended: [], removed: [] };
  const byId = {};
  const home = { appendChild: (n) => { bag.appended.push(n); if (n.id) byId[n.id] = n; } };
  const priorDocument = global.document;
  const priorFetch = global.fetch;
  global.document = {
    getElementById: (id) => byId[id] || null,
    createElement: () => ({ id: "", className: "", innerHTML: "", style: {}, querySelector: () => null }),
  };
  global.fetch = (url) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[key]) });
  };
  return {
    home,
    shell: shellNode(bag),
    bag,
    restore() {
      if (priorDocument === undefined) delete global.document; else global.document = priorDocument;
      if (priorFetch === undefined) delete global.fetch; else global.fetch = priorFetch;
    },
  };
}

// Anchored to today's real week so the test does not expire.
function currentOrder(slug) {
  return {
    schedule: [{
      week: t.spotlightWeekStart(t.rainPacificDay()),
      slug: slug,
      business: "Test Business",
      blurb: "A blurb.",
    }],
  };
}

test("initHomeSpotlight fills the shell in place and reveals it", async () => {
  const h = harness({
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, h.shell);
    assert.match(h.shell.innerHTML, /bcl-spot-kick/);
    assert.match(h.shell.innerHTML, /Test Business/);
    assert.equal(h.shell.style.display, "", "the shell has to become visible");
    assert.equal(h.bag.removed.length, 0, "nothing was deleted");
    assert.equal(h.bag.appended.length, 0, "the shell was reused, not duplicated");
  } finally { h.restore(); }
});

test("a second run does not stack a second spotlight card", async () => {
  const h = harness({
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, h.shell);
    await t.initHomeSpotlight(h.home, h.shell);
    await t.initHomeSpotlight(h.home, h.shell);
    assert.equal(h.bag.appended.length, 0);
    assert.equal((h.shell.innerHTML.match(/bcl-spot-kick/g) || []).length, 1, "one card, not three");
  } finally { h.restore(); }
});

test("two runs racing each other still leave one card", async () => {
  const h = harness({
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await Promise.all([t.initHomeSpotlight(h.home, h.shell), t.initHomeSpotlight(h.home, h.shell)]);
    assert.equal((h.shell.innerHTML.match(/bcl-spot-kick/g) || []).length, 1);
  } finally { h.restore(); }
});

test("initHome builds the shell above the rain card and clears its own prior one", () => {
  assert.match(SRC, /\["bcl-home-board", "bcl-home-recent", "bcl-home-rain", "bcl-home-spotlight"\]/);
  // The shell is created synchronously, right after the board.
  assert.match(SRC, /spotSec\.id = "bcl-home-spotlight";/);
  assert.match(SRC, /spotSec\.style\.display = "none";/);
  assert.match(SRC, /insertBefore\(spotSec, lastBoardSec\.nextSibling\)/);
  // ...and the rain card anchors AFTER it, which is what puts spotlight above rain.
  assert.match(SRC, /initHomeRainCard\(spotSec \|\| lastBoardSec\)/);
  assert.match(SRC, /initHomeSpotlight\(home, spotSec\)/);
});

/* Every one of these must leave NO empty section behind. */
const EMPTY_CASES = {
  "no spotlight.json": {},
  "a spotlight.json that parses to the wrong shape": { "/data/spotlight.json": { weeks: [] } },
  "an abandoned running order": {
    "/data/spotlight.json": { schedule: [{ week: "2020-01-02", slug: "two-boulder-creek", business: "Old", blurb: "Long gone." }] },
  },
  "a slug with no live article": { "/data/spotlight.json": currentOrder("missing-boulder-creek") },
  "a 200 that answers with a different post": {
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: { ...ITEM, urlId: "other" } },
  },
  "a live post with no image of its own": {
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: { ...ITEM, assetUrl: "" } },
  },
};

Object.keys(EMPTY_CASES).forEach((name) => {
  test(name + " removes the shell rather than leaving a blank band", async () => {
    const h = harness(EMPTY_CASES[name]);
    try {
      await t.initHomeSpotlight(h.home, h.shell);
      assert.equal(h.shell.innerHTML, "", "nothing was written");
      assert.equal(h.bag.removed.length, 1, "the empty shell must be deleted, not left as a gap");
      assert.equal(h.bag.appended.length, 0);
    } finally { h.restore(); }
  });
});

test("with no shell it falls back to appending, rather than losing the card", async () => {
  const h = harness({
    "/data/spotlight.json": currentOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, null);
    assert.equal(h.bag.appended.length, 1);
    assert.equal(h.bag.appended[0].id, "bcl-home-spotlight");
    assert.match(h.bag.appended[0].innerHTML, /Test Business/);
  } finally { h.restore(); }
});

test("no homepage and no shell means nothing is appended anywhere", async () => {
  const h = harness({});
  try {
    await t.initHomeSpotlight(null, null);
    assert.equal(h.bag.appended.length, 0);
  } finally { h.restore(); }
});

/* ---------- the running order itself ---------- */

test("spotlight.json: every scheduled week starts on a Thursday", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.equal(t.spotlightWeekStart(row.week), row.week, row.week + " is not a Thursday");
  });
});

test("spotlight.json: weeks are unique and in ascending order", () => {
  const weeks = SPOTLIGHT.schedule.map((r) => r.week);
  assert.deepEqual(weeks, [...weeks].sort(), "rows must read in date order");
  assert.equal(new Set(weeks).size, weeks.length, "two businesses cannot start the same Thursday");
  // Gaps ARE allowed now, on purpose: the previous business holds the card.
});

test("spotlight.json: every slug is a published article", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.ok(LIVE_SLUGS.has(row.slug), row.slug + " is not in live-article-slugs.json");
  });
});

test("spotlight.json: it MIRRORS the social schedule, which is the source of truth", () => {
  // The running order was once invented here while a real one already existed in
  // the Blotato schedule. This test is what stops that happening twice.
  if (!fs.existsSync(SCHEDULE_CSV)) return; // path not present in every checkout
  const csv = fs.readFileSync(SCHEDULE_CSV, "utf8");
  const wanted = new Map();
  csv.split(/\r?\n/).forEach((line) => {
    if (!/BCL-SPOT/i.test(line)) return;
    const date = (line.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    const slug = (line.match(/around-town\/([a-z0-9-]+)/) || [])[1];
    if (date && slug && !wanted.has(date)) wanted.set(date, slug);
  });
  assert.ok(wanted.size > 0, "no BCL-SPOT rows parsed, check the CSV shape");
  const have = new Map(SPOTLIGHT.schedule.map((r) => [r.week, r.slug]));
  wanted.forEach((slug, date) => {
    assert.equal(have.get(date), slug, date + " should feature " + slug + " to match the social post");
  });
});

test("spotlight.json: every row carries the four fields the card is built from", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.ok(t.spotlightRowIsUsable(row), row.week + " is missing something the card needs");
  });
});

test("spotlight.json: blurbs follow the brand copy rules", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.doesNotMatch(row.blurb, /[\u2014\u2013]/, row.business + ": no em-dashes or en-dashes");
    assert.doesNotMatch(row.blurb, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, row.business + ": no emojis");
    assert.doesNotMatch(row.blurb, /\bhonest/i, row.business + ": do not announce honesty");
    assert.doesNotMatch(row.blurb, /a testament to|here's the thing|dive into|deep dive|unlock|unleash|delve|elevate your|nestled/i,
      row.business + ": AI-tell phrasing");
    assert.ok(row.blurb.length <= 260, row.business + ": " + row.blurb.length + " chars is too long for the card");
    assert.ok(row.blurb.length >= 60, row.business + ": too short to be worth clicking");
  });
});

/* ---------- the stylesheet ---------- */

test("the spotlight card cannot overflow the homepage sideways", () => {
  assert.match(SRC, /\.bcl-spot-img\{[^"]*min-width:0/);
  assert.match(SRC, /\.bcl-spot-body\{[^"]*min-width:0/);
  assert.match(SRC, /\.bcl-spot\{box-sizing:border-box/);
  assert.match(SRC, /@media \(max-width:820px\)\{\.bcl-spot-img,\.bcl-spot-body\{flex:1 1 100%;\}/);
});

test("the spotlight card uses brand tokens and never gold", () => {
  const block = SRC.split("\".bcl-spot{")[1].split("/* Residents page")[0];
  assert.match(block, /#173f36/); // forest, business name
  assert.match(block, /#2e6b46/); // link green, call to action
  assert.equal(/#e4b957/i.test(block), false, "gold is retired as a UI colour");
  assert.match(block, /\.bcl-spot:focus-visible\{outline:3px solid #d56e47/); // full clay on the ring
});

test("card text passes WCAG AA against the card's own background", () => {
  // The owner reported the card hard to read. Clay #d56e47 measures 3.36:1 on
  // #fffdf8 and fails for text this size, so the kicker uses a darkened clay.
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const pair = [lum(a), lum(b)].sort((x, y) => y - x);
    return (pair[0] + 0.05) / (pair[1] + 0.05);
  };
  const bg = "#fffdf8";
  const grab = (cls) => (SRC.match(new RegExp("\\." + cls + "\\{[^\"]*color:(#[0-9a-f]{6})")) || [])[1];
  ["bcl-spot-kick", "bcl-spot-name", "bcl-spot-blurb", "bcl-spot-go"].forEach((cls) => {
    const c = grab(cls);
    assert.ok(c, cls + " has no colour to check");
    assert.ok(ratio(c, bg) >= 4.5,
      cls + " (" + c + ") is " + ratio(c, bg).toFixed(2) + ":1 on " + bg + ", needs 4.5");
  });
  assert.ok(ratio("#d56e47", bg) < 4.5, "if clay ever passes, the darkened kicker can go back to it");
});

test("the blurb is big enough to read, which is why it changed", () => {
  // Owner, 2026-09-09: "make this weeks business spotlight text larger or bold,
  // it's hard to read". It was .95rem at weight 400.
  const blurb = (SRC.match(/\.bcl-spot-blurb\{[^"]*/) || [""])[0];
  assert.match(blurb, /font-size:clamp\(1\.02rem/);
  assert.match(blurb, /font-weight:500/);
  assert.doesNotMatch(blurb, /font-size:\.9/);
});
