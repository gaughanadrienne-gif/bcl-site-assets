const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const t = require("../bcl-tools.js");
const feed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "articles.json"), "utf8"));

// Anchors that exist on the live /residents page (checked 2026-09-27).
const LIVE_ANCHORS = ["new-resident-checklist", "res-trash-recycling-and-green-waste", "res-water-and-power",
  "res-internet-and-cell", "res-schools-and-families", "res-everyday-places", "res-roads",
  "res-emergency-readiness", "res-permits-and-building"];
const PAGES = ["/directory", "/events", "/give-back", "/jobs", "/contact"];

test("five situation groups, each with at least four links", () => {
  assert.equal(t.RES_GROUPS.length, 5);
  for (const g of t.RES_GROUPS) assert.ok(g[2].length >= 4, g[1]);
});

test("every group link resolves to a live anchor, page, or published article", () => {
  for (const g of t.RES_GROUPS) for (const [label, href] of g[2]) {
    if (href.startsWith("#")) assert.ok(LIVE_ANCHORS.includes(href.slice(1)), `${label} -> ${href}`);
    else if (href.startsWith("/around-town/")) assert.ok(feed.articles[href.slice(13)], `${label} -> ${href}`);
    else assert.ok(PAGES.includes(href), `${label} -> ${href}`);
  }
});

test("help row routes emergencies to 911 and never replaces official sources", () => {
  const h = t.residentsHelpHTML();
  assert.match(h, /href="tel:911"/);
  assert.match(h, /pgealerts\.alerts\.pge\.com/);
  assert.match(h, /protect\.genasys\.com/);
  assert.match(h, /\/mountain-status/);
});

test("group copy follows the brand rules", () => {
  const all = t.residentsGroupsHTML() + t.residentsHelpHTML();
  assert.ok(!/\u2014/.test(all), "no em-dashes");
});
