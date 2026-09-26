const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");

const DATA = path.join(__dirname, "..", "..", "data");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const FIELDS = ["title", "reviewedAt", "headerImage", "imageAlt"];

test("article pages read the small metadata file by name", () => {
  assert.equal(t.ARTICLE_META_FILE, "articles-meta.json");
});

test("articles-meta.json matches articles.json exactly (regenerate with scripts.build_article_meta)", () => {
  const feed = read("articles.json");
  const meta = read("articles-meta.json");
  assert.deepEqual(Object.keys(meta.articles).sort(), Object.keys(feed.articles).sort());
  assert.deepEqual(meta.withheldSlugs, feed.withheldSlugs);
  assert.equal(meta.asOf, feed.asOf);
  for (const slug of Object.keys(feed.articles)) {
    const want = {};
    for (const k of FIELDS) if (feed.articles[slug][k]) want[k] = feed.articles[slug][k];
    assert.deepEqual(meta.articles[slug], want, slug);
  }
});

test("articles-meta.json carries no bodies and stays small", () => {
  const raw = fs.readFileSync(path.join(DATA, "articles-meta.json"), "utf8");
  assert.ok(!/"html"\s*:/.test(raw), "metadata must not include html bodies");
  const full = fs.statSync(path.join(DATA, "articles.json")).size;
  assert.ok(raw.length < full / 10, `meta ${raw.length} bytes vs feed ${full}`);
});

test("categoryDescriptionFor matches the active archive on its encoded tail", () => {
  const cats = [
    { name: "Food", url: "/around-town/category/Food", description: "Where to eat." },
    { name: "Town & History", url: "/around-town/category/Town+%26+History", description: "The past." },
    { name: "Outdoors", url: "/around-town/category/Outdoors" },
  ];
  assert.equal(t.categoryDescriptionFor(cats, "food"), "Where to eat.");
  assert.equal(t.categoryDescriptionFor(cats, "Town+%26+History"), "The past.");
  assert.equal(t.categoryDescriptionFor(cats, "Outdoors"), "");
  assert.equal(t.categoryDescriptionFor(cats, ""), "");
  assert.equal(t.categoryDescriptionFor(null, "Food"), "");
});

test("every live category in categories.json has a description under 160 characters", () => {
  const cats = read("categories.json").categories;
  for (const c of cats) {
    assert.ok(c.description && c.description.length <= 160, c.name);
    assert.ok(!/—/.test(c.description), `${c.name} has an em-dash`);
  }
});
