const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");
const clears = (h) => [...h.matchAll(/data-clear="([^"]+)"/g)].map((m) => m[1]);

test("no filters, no tags", () => {
  assert.equal(t.activeFilterTagsHTML({}), "");
  assert.equal(t.activeFilterTagsHTML(), "");
});

test("one tag per filter in effect; Clear all only with two or more", () => {
  assert.deepEqual(clears(t.activeFilterTagsHTML({ open: true })), ["open"]);
  assert.deepEqual(clears(t.activeFilterTagsHTML({ q: "plumber", category: "Plumbing & HVAC", open: true, local: true })), ["q", "category", "open", "local", "all"]);
});

test("a chosen category wins over the group chip, matching the list filter", () => {
  assert.deepEqual(clears(t.activeFilterTagsHTML({ category: "Bakeries", group: "Food & Drink" })), ["category"]);
  assert.deepEqual(clears(t.activeFilterTagsHTML({ group: "Food & Drink" })), ["group"]);
});

test("search text is escaped and every tag has an accessible name", () => {
  const h = t.activeFilterTagsHTML({ q: '<img src=x onerror="a">' });
  assert.ok(!h.includes("<img"));
  assert.match(h, /aria-label="Remove filter: Search: &lt;img/);
  assert.match(h, /<button type="button"/);
});
