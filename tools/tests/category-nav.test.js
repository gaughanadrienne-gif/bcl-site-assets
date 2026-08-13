const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");

const CATS = [
  { name: "Local News", url: "/around-town/category/Local+News" },
  { name: "Business Spotlights", url: "/around-town/category/Business+Spotlights" },
  { name: "Town & History", url: "/around-town/category/Town+%26+History" },
];
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test("categoryPathOf: reads the encoded slug off a category path", () => {
  assert.equal(t.categoryPathOf("/around-town/category/Business+Spotlights"), "Business+Spotlights");
  assert.equal(t.categoryPathOf("/around-town/category/Town+%26+History/"), "Town+%26+History");
});

test("categoryPathOf: the listing and unrelated pages are not category pages", () => {
  assert.equal(t.categoryPathOf("/around-town"), "");
  assert.equal(t.categoryPathOf("/around-town/some-article"), "");
  assert.equal(t.categoryPathOf("/directory"), "");
  assert.equal(t.categoryPathOf(""), "");
});

test("buildCategoryStrip: leads with All stories, then the categories in feed order", () => {
  const html = t.buildCategoryStrip(CATS, "");
  assert.deepEqual(hrefs(html), [
    "/around-town",
    "/around-town/category/Local+News",
    "/around-town/category/Business+Spotlights",
    "/around-town/category/Town+%26+History",
  ]);
});

test("buildCategoryStrip: on the listing, All stories is the current page", () => {
  const html = t.buildCategoryStrip(CATS, "");
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="\/around-town"[^>]*aria-current="page"/);
});

test("buildCategoryStrip: on a category page, exactly that chip is current", () => {
  const html = t.buildCategoryStrip(CATS, "Business+Spotlights");
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /Business\+Spotlights"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /href="\/around-town"[^>]*aria-current/);
});

test("buildCategoryStrip: a percent-encoded category still matches itself", () => {
  // Town & History encodes to Town+%26+History. Comparing decoded names would
  // work too until one of them round-tripped differently; the URL tail is the
  // form both sides are guaranteed to agree on.
  const html = t.buildCategoryStrip(CATS, "Town+%26+History");
  assert.match(html, /Town\+%26\+History"[^>]*aria-current="page"/);
  assert.equal((html.match(/is-on/g) || []).length, 1);
});

test("buildCategoryStrip: category names are escaped", () => {
  const html = t.buildCategoryStrip([{ name: 'A "B" & C', url: "/around-town/category/x" }], "");
  assert.match(html, /&quot;B&quot;/);
  assert.match(html, /&amp; C/);
});

test("buildCategoryStrip: survives a malformed or empty feed", () => {
  assert.match(t.buildCategoryStrip([], ""), /All stories/);
  assert.match(t.buildCategoryStrip(null, ""), /All stories/);
  // A row missing its url would otherwise render href="undefined".
  const html = t.buildCategoryStrip([{ name: "Broken" }, ...CATS], "");
  assert.doesNotMatch(html, /undefined/);
  assert.equal(hrefs(html).length, 4);
});

test("categories.json holds only categories that are LIVE on the site", () => {
  // A Squarespace category does not exist until a post carries it, and linking
  // a postless one ships a 404 on a live page. Meet Your Neighbors was exactly
  // that case on 2026-08-13.
  const file = path.join(__dirname, "..", "..", "data", "categories.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.ok(data.categories.length > 0, "the strip must never be empty");
  data.categories.forEach((c) => {
    assert.ok(c.name && c.url, "every live category needs a name and a url");
    assert.doesNotMatch(c.name, /,/, "a comma soft-404s the Squarespace filter");
    assert.match(c.url, /^\/around-town\/category\//);
  });
  (data.pending || []).forEach((c) => {
    assert.notEqual(c.status, 200, "a 200 category belongs in categories, not pending");
  });
});

test("every category the strip links is reachable from the taxonomy builder", () => {
  const file = path.join(__dirname, "..", "..", "data", "categories.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const html = t.buildCategoryStrip(data.categories, "");
  // Nothing pending may leak into the rendered strip.
  (data.pending || []).forEach((c) => {
    assert.equal(html.includes(c.url), false, `${c.name} is pending and must not be linked`);
  });
});
