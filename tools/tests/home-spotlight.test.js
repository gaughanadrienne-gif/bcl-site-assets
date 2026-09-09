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

/* ---------- the week boundary ---------- */

test("spotlightWeekStart: a Wednesday owns its own week", () => {
  assert.equal(t.spotlightWeekStart("2026-09-09"), "2026-09-09");
  assert.equal(t.spotlightWeekStart("2026-09-16"), "2026-09-16");
});

test("spotlightWeekStart: Thursday through Tuesday all fall back to the Wednesday", () => {
  // Wed 2026-09-09 through Tue 2026-09-15 are one spotlight week.
  ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"]
    .forEach((day) => assert.equal(t.spotlightWeekStart(day), "2026-09-09", day));
  // The next day starts the next week, which is the whole point.
  assert.equal(t.spotlightWeekStart("2026-09-16"), "2026-09-16");
});

test("spotlightWeekStart: rejects anything that is not a real calendar day", () => {
  [null, undefined, "", "2026-09", "09/09/2026", "2026-9-9", "not a date", 20260909,
   "2026-02-31", "2026-13-01", "2026-09-00"].forEach((bad) => {
    assert.equal(t.spotlightWeekStart(bad), null, JSON.stringify(bad));
  });
});

test("the boundary is Wednesday 00:00 Pacific: Tuesday 23:59 is still last week", () => {
  // PDT is UTC-7 in September.
  const tueLate = t.rainPacificDay(new Date("2026-09-09T06:59:00Z")); // Tue Sep 8, 23:59 PT
  const wedEarly = t.rainPacificDay(new Date("2026-09-09T07:01:00Z")); // Wed Sep 9, 00:01 PT
  assert.equal(tueLate, "2026-09-08");
  assert.equal(wedEarly, "2026-09-09");
  assert.equal(t.spotlightWeekStart(tueLate), "2026-09-02");
  assert.equal(t.spotlightWeekStart(wedEarly), "2026-09-09");
});

test("the boundary holds across the November DST change, when Pacific is UTC-8", () => {
  // A fixed -7 offset would flip these two an hour early and move the changeover
  // onto the wrong calendar day for everyone reading late on a Tuesday.
  const tueLate = t.rainPacificDay(new Date("2026-11-11T07:59:00Z")); // Tue Nov 10, 23:59 PST
  const wedEarly = t.rainPacificDay(new Date("2026-11-11T08:01:00Z")); // Wed Nov 11, 00:01 PST
  assert.equal(tueLate, "2026-11-10");
  assert.equal(wedEarly, "2026-11-11");
  assert.equal(t.spotlightWeekStart(tueLate), "2026-11-04");
  assert.equal(t.spotlightWeekStart(wedEarly), "2026-11-11");
});

test("the card flips before Thursday, which is when the social post goes out", () => {
  // Thursday 06:00 Pacific, the earliest a morning post would realistically land.
  const thu = t.rainPacificDay(new Date("2026-09-10T13:00:00Z"));
  assert.equal(thu, "2026-09-10");
  // Same week as the Wednesday changeover, so the homepage already matches the post.
  assert.equal(t.spotlightWeekStart(thu), "2026-09-09");
});

test("a reader outside Pacific sees the week Boulder Creek is in, not their own", () => {
  // Wednesday noon in Tokyo is still Tuesday evening in Boulder Creek, so this
  // reader correctly gets LAST week's business until the Pacific boundary passes.
  const tokyoWedNoon = new Date("2026-09-09T03:00:00Z");
  assert.equal(t.rainPacificDay(tokyoWedNoon), "2026-09-08");
  assert.equal(t.spotlightWeekStart(t.rainPacificDay(tokyoWedNoon)), "2026-09-02");
  // Wednesday early evening in London is already Wednesday morning here.
  const londonWedEvening = new Date("2026-09-09T17:00:00Z");
  assert.equal(t.rainPacificDay(londonWedEvening), "2026-09-09");
  assert.equal(t.spotlightWeekStart(t.rainPacificDay(londonWedEvening)), "2026-09-09");
});

/* ---------- picking the week ---------- */

const ORDER = {
  schedule: [
    { week: "2026-09-09", slug: "one-boulder-creek", business: "One", blurb: "First week." },
    { week: "2026-09-16", slug: "two-boulder-creek", business: "Two", blurb: "Second week." },
    { week: "2026-09-23", slug: "three-boulder-creek", business: "Three", blurb: "Third week." },
  ],
};

test("spotlightPick: every day of a week returns that week's business", () => {
  ["2026-09-16", "2026-09-17", "2026-09-19", "2026-09-22"].forEach((day) => {
    assert.equal(t.spotlightPick(ORDER, day).business, "Two", day);
  });
  assert.equal(t.spotlightPick(ORDER, "2026-09-15").business, "One");
  assert.equal(t.spotlightPick(ORDER, "2026-09-23").business, "Three");
});

test("spotlightPick: a running order that has run out returns nothing", () => {
  // The Tuesday the last scheduled week ends is the last day anything shows.
  assert.equal(t.spotlightPick(ORDER, "2026-09-29").business, "Three");
  assert.equal(t.spotlightPick(ORDER, "2026-09-30"), null);
  assert.equal(t.spotlightPick(ORDER, "2027-01-06"), null);
});

test("spotlightPick: a week that has not started yet returns nothing", () => {
  assert.equal(t.spotlightPick(ORDER, "2026-09-08"), null);
});

test("spotlightPick: missing or malformed data returns nothing", () => {
  const day = "2026-09-16";
  [null, undefined, "", 0, [], "a string", { }, { schedule: null }, { schedule: {} },
   { schedule: "2026-09-16" }, { weeks: ORDER.schedule }].forEach((bad) => {
    assert.equal(t.spotlightPick(bad, day), null, JSON.stringify(bad));
  });
  // A well-formed file with an empty order is the same silent state.
  assert.equal(t.spotlightPick({ schedule: [] }, day), null);
});

test("spotlightPick: a row missing any field the card needs is skipped, not half-rendered", () => {
  const day = "2026-09-16";
  const good = ORDER.schedule[1];
  const broken = [
    { week: "2026-09-16", slug: "x-boulder-creek", business: "X" },              // no blurb
    { week: "2026-09-16", slug: "x-boulder-creek", blurb: "b" },                 // no business
    { week: "2026-09-16", business: "X", blurb: "b" },                           // no slug
    { slug: "x-boulder-creek", business: "X", blurb: "b" },                      // no week
    { week: "2026-09-16", slug: "x-boulder-creek", business: "  ", blurb: "b" }, // blank business
    { week: "2026-09-16", slug: "x-boulder-creek", business: "X", blurb: "  " }, // blank blurb
    { week: "not-a-date", slug: "x-boulder-creek", business: "X", blurb: "b" },
    null, "row", 7,
  ];
  broken.forEach((row) => assert.equal(t.spotlightPick({ schedule: [row] }, day), null, JSON.stringify(row)));
  // The good row still wins when it sits behind broken ones.
  assert.equal(t.spotlightPick({ schedule: broken.concat([good]) }, day).business, "Two");
});

test("spotlightPick: a slug that is not a Squarespace slug shape is refused", () => {
  const day = "2026-09-16";
  ["../../data/directory.json", "a b", "UPPER", "slug?x=1", "/leading", "-leading", ""].forEach((slug) => {
    const row = { week: "2026-09-16", slug: slug, business: "X", blurb: "b" };
    assert.equal(t.spotlightPick({ schedule: [row] }, day), null, slug);
  });
});

test("spotlightPick: a date the browser could not resolve returns nothing", () => {
  // rainPacificDay returns null where Intl cannot name the zone; that has to
  // reach the card as "render nothing", never as a default week.
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
  // Squarespace can answer with the collection listing instead of a 404.
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
  assert.match(html, /Second week\./);
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
    { slug: "x-boulder-creek", business: '<script>x</script>', blurb: 'He said "no" & left' },
    { urlId: "x-boulder-creek", assetUrl: "https://x/y.jpg", title: "<b>T</b>" }
  );
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;no&quot; &amp; left/);
  assert.match(html, /alt="&lt;b&gt;T&lt;\/b&gt;"/);
});

/* ---------- rendering, including the second initHome() run ---------- */

/* Just enough DOM for initHomeSpotlight: it reads getElementById, makes one
   section, and inserts it before the Around Town strip. No library available in
   this repo, and the real homepage is checked separately in a browser. */
function harness(routes) {
  const byId = {};
  const inserted = [];
  const keep = (node) => { inserted.push(node); if (node.id) byId[node.id] = node; };
  const home = { appendChild: keep };
  const parent = { insertBefore: keep };
  const priorDocument = global.document;
  const priorFetch = global.fetch;
  global.document = {
    getElementById: (id) => byId[id] || null,
    createElement: () => ({ id: "", className: "", innerHTML: "", querySelector: () => null }),
  };
  global.fetch = (url) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[key]) });
  };
  return {
    home,
    before: { parentNode: parent },
    inserted,
    restore() {
      if (priorDocument === undefined) delete global.document; else global.document = priorDocument;
      if (priorFetch === undefined) delete global.fetch; else global.fetch = priorFetch;
    },
  };
}

// Anchored to today's real week so the test does not expire.
function thisWeekOrder(slug) {
  return {
    schedule: [{
      week: t.spotlightWeekStart(t.rainPacificDay()),
      slug: slug,
      business: "Test Business",
      blurb: "A blurb.",
    }],
  };
}

test("initHomeSpotlight renders one card before the Around Town strip", async () => {
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 1);
    assert.equal(h.inserted[0].id, "bcl-home-spotlight");
    assert.equal(h.inserted[0].className, "bcl-section");
    assert.match(h.inserted[0].innerHTML, /bcl-spot-kick/);
    assert.match(h.inserted[0].innerHTML, /Test Business/);
  } finally { h.restore(); }
});

test("a second initHome() run does not stack a second spotlight section", async () => {
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    await t.initHomeSpotlight(h.home, h.before);
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 1, "one section, however many times boot runs");
  } finally { h.restore(); }
});

test("two runs racing each other still leave one section", async () => {
  // A cached copy of this script and the live one can both be in flight; the
  // id check after the fetch is what covers that, not the one before it.
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await Promise.all([t.initHomeSpotlight(h.home, h.before), t.initHomeSpotlight(h.home, h.before)]);
    assert.equal(h.inserted.length, 1);
  } finally { h.restore(); }
});

test("initHome removes its own prior spotlight section before rebuilding", () => {
  assert.match(SRC, /\["bcl-home-board", "bcl-home-recent", "bcl-home-rain", "bcl-home-spotlight"\]/);
  assert.match(SRC, /initHomeSpotlight\(home, recent\);/);
});

test("no spotlight.json means no card", async () => {
  const h = harness({});
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

test("a spotlight.json that parses to the wrong shape means no card", async () => {
  for (const payload of [{}, { schedule: "soon" }, [], null, { schedule: [] }]) {
    const h = harness({ "/data/spotlight.json": payload });
    try {
      await t.initHomeSpotlight(h.home, h.before);
      assert.equal(h.inserted.length, 0, JSON.stringify(payload));
    } finally { h.restore(); }
  }
});

test("a week nobody scheduled means no card, and nothing else on the page changes", async () => {
  const h = harness({
    "/data/spotlight.json": { schedule: [{ week: "2019-01-02", slug: "old-boulder-creek", business: "Old", blurb: "b" }] },
    "/around-town/old-boulder-creek?format=json": { item: { urlId: "old-boulder-creek", assetUrl: "https://x/y.jpg" } },
  });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

test("a slug with no live article means no card", async () => {
  // The article request 404s, which fetchJSON turns into a rejection.
  const h = harness({ "/data/spotlight.json": thisWeekOrder("gone-boulder-creek") });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

test("a 200 that answers with a different post means no card", async () => {
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: { ...ITEM, urlId: "some-other-post" } },
  });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

test("a live post with no image of its own means no card", async () => {
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: { urlId: "two-boulder-creek" } },
  });
  try {
    await t.initHomeSpotlight(h.home, h.before);
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

test("a detached anchor sends the card to the end of the homepage, not to nothing", async () => {
  // initRecentArticles removes the Around Town strip when the blog feed is down,
  // and that can happen while this fetch is still in flight. One section failing
  // must not take the spotlight with it.
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(h.home, { parentNode: null });
    assert.equal(h.inserted.length, 1);
    assert.equal(h.inserted[0].id, "bcl-home-spotlight");
  } finally { h.restore(); }
});

test("no homepage and no anchor means nothing is appended anywhere", async () => {
  const h = harness({
    "/data/spotlight.json": thisWeekOrder("two-boulder-creek"),
    "/around-town/two-boulder-creek?format=json": { item: ITEM },
  });
  try {
    await t.initHomeSpotlight(null, null);
    await t.initHomeSpotlight(null, { parentNode: null });
    assert.equal(h.inserted.length, 0);
  } finally { h.restore(); }
});

/* ---------- the seeded running order ---------- */

test("spotlight.json: every scheduled week starts on a Wednesday", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.equal(t.spotlightWeekStart(row.week), row.week,
      `${row.week} (${row.business}) is not a Wednesday, so the card would go live early`);
  });
});

test("spotlight.json: weeks are unique, consecutive, and in order", () => {
  const weeks = SPOTLIGHT.schedule.map((r) => r.week);
  assert.equal(new Set(weeks).size, weeks.length, "two rows claiming one week is ambiguous");
  for (let i = 1; i < weeks.length; i++) {
    const gap = (Date.parse(weeks[i] + "T00:00:00Z") - Date.parse(weeks[i - 1] + "T00:00:00Z")) / 86400000;
    assert.equal(gap, 7, `${weeks[i - 1]} to ${weeks[i]} is ${gap} days, not one week`);
  }
});

test("spotlight.json: every slug is a published article", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.ok(LIVE_SLUGS.has(row.slug), `${row.slug} is not in live-article-slugs.json`);
  });
});

test("spotlight.json: none of the held slugs are scheduled", () => {
  const held = new Set(SPOTLIGHT._hold_slugs);
  assert.ok(held.size > 0, "the hold list must survive edits to this file");
  SPOTLIGHT.schedule.forEach((row) => {
    assert.equal(held.has(row.slug), false, `${row.slug} is mid-correction and must not be scheduled`);
  });
});

test("spotlight.json: every row carries the four fields the card is built from", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.ok(t.spotlightRowIsUsable(row), `${row.week} is missing something the card needs`);
  });
});

test("spotlight.json: blurbs follow the brand copy rules", () => {
  SPOTLIGHT.schedule.forEach((row) => {
    assert.doesNotMatch(row.blurb, /[—–]/, `${row.business}: no em-dashes or en-dashes`);
    assert.doesNotMatch(row.blurb, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${row.business}: no emojis`);
    // AI-tells the brand guide names, plus the announced-honesty family.
    assert.doesNotMatch(row.blurb, /\bhonest/i, `${row.business}: do not announce honesty`);
    assert.doesNotMatch(row.blurb, /a testament to|here's the thing|dive into|deep dive|unlock|unleash|delve|elevate your|nestled/i,
      `${row.business}: AI-tell phrasing`);
    assert.ok(row.blurb.length <= 260, `${row.business}: ${row.blurb.length} chars is too long for the card`);
    assert.ok(row.blurb.length >= 60, `${row.business}: too short to be worth clicking`);
  });
});

test("spotlight.json: the hold note names the four articles that are mid-correction", () => {
  ["air-and-fire-boulder-creek", "wild-lilith-boulder-creek", "good-vibes-boulder-creek",
   "boulder-creek-golf-country-club"].forEach((slug) => {
    assert.ok(SPOTLIGHT._hold_slugs.includes(slug), `${slug} must stay on the hold list`);
  });
});

/* ---------- the stylesheet ---------- */

test("the spotlight card cannot overflow the homepage sideways", () => {
  // Both flex children carry min-width:0. Without it a long business name sets
  // the flex base and pushes the card past .bcl-wrap, which is the exact failure
  // the rain card comment documents.
  assert.match(SRC, /\.bcl-spot-img\{[^"]*min-width:0/);
  assert.match(SRC, /\.bcl-spot-body\{[^"]*min-width:0/);
  assert.match(SRC, /\.bcl-spot\{box-sizing:border-box/);
  assert.match(SRC, /@media \(max-width:820px\)\{\.bcl-spot-img,\.bcl-spot-body\{flex:1 1 100%;\}/);
});

test("the spotlight card uses brand tokens and never gold", () => {
  const block = SRC.split('".bcl-spot{')[1].split('/* Residents page')[0];
  assert.match(block, /#173f36/); // forest, business name
  assert.match(block, /#d56e47/); // clay, kicker and focus ring
  assert.match(block, /#2e6b46/); // link green, call to action
  assert.equal(/#e4b957/i.test(block), false, "gold is retired as a UI colour");
  assert.match(block, /\.bcl-spot:focus-visible\{outline:3px solid #d56e47/);
});
