const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const POSTS = [
  { urlId: "boulder-creek-power-outage-plan", assetUrl: "https://img/a.jpg", publishOn: 500,
    title: "Power Outage Plan", categories: ["Preparedness"], tags: ["utilities"] },
  { urlId: "boulder-creek-utilities-guide", assetUrl: "https://img/b.jpg", publishOn: 400,
    title: "Utilities Guide", categories: ["Preparedness"], tags: [] },
  { urlId: "boulder-creek-emergency-contacts", assetUrl: "https://img/c.jpg", publishOn: 300,
    title: "Emergency Contacts", categories: ["Preparedness"], tags: ["utilities"] },
  { urlId: "boulder-creek-logging-history", assetUrl: "https://img/d.jpg", publishOn: 900,
    title: "Logging History", categories: ["History"], tags: [] },
  { urlId: "no-image-draft", publishOn: 950, title: "Draft", categories: ["History"] },
];

test("pickRelatedArticles never recommends the article being read", () => {
  const picks = t.pickRelatedArticles(POSTS, "boulder-creek-power-outage-plan", 3);
  assert.ok(!picks.some((p) => p.urlId === "boulder-creek-power-outage-plan"));
});
test("pickRelatedArticles ranks shared categories/tags above raw recency", () => {
  assert.deepEqual(
    t.pickRelatedArticles(POSTS, "boulder-creek-power-outage-plan", 2).map((p) => p.urlId),
    ["boulder-creek-emergency-contacts", "boulder-creek-utilities-guide"]
  );
});
test("pickRelatedArticles backfills with recent posts once matches run out", () => {
  assert.deepEqual(
    t.pickRelatedArticles(POSTS, "boulder-creek-power-outage-plan", 3).map((p) => p.urlId),
    ["boulder-creek-emergency-contacts", "boulder-creek-utilities-guide", "boulder-creek-logging-history"]
  );
});
test("pickRelatedArticles skips posts without a card image", () => {
  const picks = t.pickRelatedArticles(POSTS, "boulder-creek-logging-history", 5);
  assert.ok(!picks.some((p) => p.urlId === "no-image-draft"));
});
test("pickRelatedArticles handles an empty or missing feed", () => {
  assert.deepEqual(t.pickRelatedArticles([], "x", 3), []);
  assert.deepEqual(t.pickRelatedArticles(null, "x", 3), []);
});
test("articleCardHTML renders an image card with title alt and no undefined", () => {
  const html = t.articleCardHTML(POSTS[0]);
  assert.ok(html.includes('class="bcl-recent-card"'));
  assert.ok(html.includes("https://img/a.jpg?format=750w"));
  assert.ok(html.includes('alt="Power Outage Plan"'));
  assert.ok(html.includes("/around-town/boulder-creek-power-outage-plan"));
  assert.ok(!html.includes("undefined"));
});
