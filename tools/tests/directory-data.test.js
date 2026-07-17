const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const data = require(path.join(__dirname, "../../data/directory.json")).listings;
const logic = require("../bcl-tools.js");
const count = (c) => data.filter((x) => x.category === c).length;

test("Events & Celebrations is fully split", () => {
  assert.equal(count("Events & Celebrations"), 0);
  assert.equal(count("Event Venues"), 12);
  assert.equal(count("Catering & Bar"), 7);
  assert.equal(count("Cakes & Desserts"), 7);
  assert.equal(count("Wedding Services"), 8);
  assert.equal(count("Party Rentals & Decor"), 7);
  assert.equal(count("Kids Parties"), 8);
});

test("Home & Property Services is fully split", () => {
  assert.equal(count("Home & Property Services"), 0);
  assert.equal(count("General Contractors & Construction"), 24);
  assert.equal(count("Plumbing & HVAC"), 9);
  assert.equal(count("Electrical & Solar"), 8);
  assert.equal(count("Landscaping & Gardening"), 8);
  assert.equal(count("Tree Care & Defensible Space"), 4);
  assert.equal(count("Excavation, Grading & Paving"), 5);
  assert.equal(count("Handyman & Property Maintenance"), 4);
  assert.equal(count("House Cleaning"), 6);
  assert.equal(count("Well & Pump / Water"), 2);
  assert.equal(count("Home Services & Repair"), 10);
});

test("Food & Drink retired; Vineyards populated and clean", () => {
  assert.equal(count("Food & Drink"), 0);
  const v = data.filter((x) => x.category === "Vineyards & Wine Tasting");
  assert.ok(v.length >= 6, "expected >= 6 vineyards, got " + v.length);
  v.forEach((x) => {
    assert.ok(x.name, "vineyard missing name");
    assert.ok(x.website, x.name + " missing website");
    // No bare street-number residential address unless a public tasting room is intended.
    if (x.address) assert.ok(!/^\d+\s+\w+.*(Dr|Drive|Ln|Lane|Ct|Court|Way|Rd|Road)\.?$/i.test(x.address.trim()) || x.no_storefront !== true, x.name + " looks like a home address");
  });
  assert.equal(data.filter((x) => x.name === "Creative Heart Kitchen").length, 0);
});
test("nearby tier curated to <=6 per NON-exempt category in the public file", () => {
  const byCat = {};
  data.forEach((l) => { (byCat[l.category] = byCat[l.category] || []).push(l); });
  Object.keys(byCat).forEach((c) => {
    if (logic.CAP_EXEMPT.indexOf(c) >= 0) return;
    const nearby = byCat[c].filter((l) => !logic.isLocal(l));
    assert.ok(nearby.length <= 6, c + " has " + nearby.length + " non-local records (max 6)");
  });
});
