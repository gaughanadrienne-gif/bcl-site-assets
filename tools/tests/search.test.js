const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const logic = require(path.join(__dirname, "../bcl-tools.js"));
const index = require(path.join(__dirname, "../../data/search-index.json"));

const R = index.records;

test("the index is present and covers every content type", () => {
  assert.ok(R.length > 600, "expected 600+ records, got " + R.length);
  const types = new Set(R.map((r) => r.t));
  ["article", "business", "food", "event", "job", "rental"].forEach((t) => {
    assert.ok(types.has(t), "index is missing type " + t);
  });
});

test("every record is usable: has a name and a url", () => {
  const bad = R.filter((r) => !r.n || !r.u);
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 3)));
});

test("searchTerms drops noise and single characters", () => {
  assert.deepEqual(logic.searchTerms("  Big  Basin!! "), ["big", "basin"]);
  assert.deepEqual(logic.searchTerms("a I x"), []);
  assert.deepEqual(logic.searchTerms(""), []);
});

test("multi-word queries are AND, not OR", () => {
  const rec = { t: "business", n: "Mountain Mechanics", s: "auto repair", k: "" };
  assert.ok(logic.scoreRecord(rec, ["mountain", "mechanics"]) > 0);
  assert.equal(logic.scoreRecord(rec, ["mountain", "bakery"]), 0);
});

test("a name hit outranks a body-text hit", () => {
  const named = { t: "business", n: "Plumbing Co", s: "", k: "" };
  const mentioned = { t: "article", n: "Storm prep", s: "check your plumbing", k: "" };
  assert.ok(logic.scoreRecord(named, ["plumbing"]) >
            logic.scoreRecord(mentioned, ["plumbing"]));
});

test("an exact name beats a prefix, which beats a mid-word match", () => {
  const t = ["ace"];
  const exact = logic.scoreRecord({ n: "Ace", s: "", k: "" }, t);
  const prefix = logic.scoreRecord({ n: "Ace Plumbing", s: "", k: "" }, t);
  const mid = logic.scoreRecord({ n: "Palace Cleaners", s: "", k: "" }, t);
  assert.ok(exact > prefix, `${exact} !> ${prefix}`);
  assert.ok(prefix > mid, `${prefix} !> ${mid}`);
});

test("keywords are searchable even though they are not displayed", () => {
  const rec = { t: "business", n: "Someone", s: "", k: "Tree Care & Defensible Space" };
  assert.ok(logic.scoreRecord(rec, ["defensible"]) > 0);
});

test("searchRecords returns ranked hits and respects the limit", () => {
  const hits = logic.searchRecords(R, "boulder creek", 5);
  assert.equal(hits.length, 5);
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i - 1].score >= hits[i].score, "results are not sorted by score");
  }
});

test("an empty query returns nothing rather than everything", () => {
  assert.deepEqual(logic.searchRecords(R, "", 10), []);
  assert.deepEqual(logic.searchRecords(R, "   ", 10), []);
});

test("real queries find the obvious answer", () => {
  // Probes verified to exist in the data. Do NOT add a term without checking:
  // "stagnaro" was tried first and is a Santa Cruz charter company from the
  // BCFD raffle work, not a BCL directory listing, so the test was wrong
  // rather than the search.
  const cases = [
    ["scopazzi", "Scopazzi"],
    ["evacuation", "vacuat"],
    ["septic", "eptic"],
    ["plumbing", "plumb"],
  ];
  for (const [q, expect] of cases) {
    const hits = logic.searchRecords(R, q, 5);
    assert.ok(hits.length, `no hits for "${q}"`);
    const top = hits[0].rec;
    assert.ok((top.n + " " + top.s).toLowerCase().includes(expect.toLowerCase()),
      `top hit for "${q}" was "${top.n}"`);
  }
});

test("groupHits orders sections by usefulness, not alphabetically", () => {
  const hits = [
    { rec: { t: "job", n: "j" } },
    { rec: { t: "business", n: "b" } },
    { rec: { t: "article", n: "a" } },
    { rec: { t: "page", n: "p" } },
  ];
  const groups = logic.groupHits(hits).map((g) => g.type);
  assert.deepEqual(groups, ["page", "business", "article", "job"]);
  // Pages rank first on purpose: someone searching "trash" wants Resident
  // Resources, not whichever business or article mentions the word.
  assert.equal(logic.SEARCH_ORDER[0], "page");
});

test("hub pages are indexed, which is what makes utility searches work", () => {
  const pages = R.filter((r) => r.t === "page");
  assert.ok(pages.length >= 8, "expected the hub pages in the index");
  const residents = pages.find((p) => p.u === "/residents");
  assert.ok(residents, "/residents missing from the index");
  // The page never says "trash" in a heading; it says GreenWaste and curbside
  // collection. Indexing body text is the only reason this query works.
  assert.ok(/trash/i.test(residents.k), "residents keywords lost the body text");
  const top = logic.searchRecords(R, "trash", 5)[0].rec;
  assert.equal(top.u, "/residents", `"trash" top hit was ${top.n}`);
});

test("directory and food hits deep-link with ?q= so the tool pre-filters", () => {
  const biz = R.find((r) => r.t === "business");
  const food = R.find((r) => r.t === "food");
  assert.match(biz.u, /^\/directory\?q=/);
  assert.match(food.u, /^\/food\?q=/);
});

test("article hits link to a real article path", () => {
  R.filter((r) => r.t === "article").forEach((r) => {
    assert.match(r.u, /^\/around-town\/[a-z0-9-]+$/, r.u);
  });
});

test("recurring events survive dedup: same title, different dates", () => {
  const events = R.filter((r) => r.t === "event");
  const byName = {};
  events.forEach((e) => { byName[e.n] = (byName[e.n] || 0) + 1; });
  const repeated = Object.values(byName).filter((n) => n > 1).length;
  assert.ok(repeated > 0,
    "expected some recurring events; a dedup key without the date silently drops them");
});

test("the index stays small enough to fetch on demand", () => {
  const bytes = Buffer.byteLength(JSON.stringify(index), "utf8");
  assert.ok(bytes < 400 * 1024, `index is ${Math.round(bytes / 1024)}KB, too heavy`);
});
