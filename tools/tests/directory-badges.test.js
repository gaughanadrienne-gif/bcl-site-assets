"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const t = require("../bcl-tools.js");
const listings = require(path.join(__dirname, "../../data/directory.json")).listings;

/* ---------- listingBadge ---------- */

test("listingBadge: a Boulder Creek storefront says so plainly", () => {
  assert.equal(t.listingBadge({ locality: "Boulder Creek" }), "In Boulder Creek");
});

test("listingBadge: a Boulder Creek trade with no storefront is not implied to have one", () => {
  assert.equal(
    t.listingBadge({ locality: "Boulder Creek", no_storefront: true }),
    "Boulder Creek based, mobile"
  );
});

test("listingBadge: valley towns read as the valley, Scotts Valley reads as itself", () => {
  assert.equal(t.listingBadge({ locality: "Felton" }), "In the San Lorenzo Valley");
  assert.equal(t.listingBadge({ locality: "Brookdale" }), "In the San Lorenzo Valley");
  assert.equal(t.listingBadge({ locality: "Scotts Valley" }), "In Scotts Valley");
});

test("listingBadge: an essential service is countywide, never 'outside the valley'", () => {
  assert.equal(
    t.listingBadge({ locality: "Santa Cruz", category: "Emergency & Public Safety" }),
    "Countywide service"
  );
  assert.equal(
    t.listingBadge({ locality: "Watsonville", category: "Government & Public Services" }),
    "Countywide service"
  );
});

test("listingBadge: a ridge winery with a Los Gatos address stays local", () => {
  assert.equal(
    t.listingBadge({ locality: "Los Gatos", name: "Byington Vineyard & Winery", category: "Vineyards & Wine Tasting" }),
    "In the Santa Cruz Mountains"
  );
});

test("listingBadge: a genuinely distant trade is labelled honestly", () => {
  assert.equal(
    t.listingBadge({ locality: "San Jose", category: "Plumbing & HVAC" }),
    "Outside the valley"
  );
});

/* ---------- the badge must never contradict the tier ---------- */

test("no listing sits in the local tier while badged outside the valley", () => {
  const contradictions = listings.filter(
    (l) => t.isLocal(l) && t.listingBadge(l) === "Outside the valley"
  );
  assert.deepEqual(contradictions.map((l) => l.name), []);
});

test("every listing in the real directory gets a badge", () => {
  const missing = listings.filter((l) => !t.listingBadge(l));
  assert.equal(missing.length, 0);
});

/* ---------- serves line ---------- */

test("showsServesBoulderCreek: only when the business is somewhere else", () => {
  // Redundant on a Boulder Creek business, so it is suppressed.
  assert.equal(
    t.showsServesBoulderCreek({ locality: "Boulder Creek", service_area: "Boulder Creek" }),
    false
  );
  assert.equal(
    t.showsServesBoulderCreek({ locality: "Felton", service_area: "Boulder Creek and the San Lorenzo Valley" }),
    true
  );
  assert.equal(
    t.showsServesBoulderCreek({ locality: "Felton", service_area: "Felton only" }),
    false
  );
  assert.equal(t.showsServesBoulderCreek({ locality: "Felton" }), false);
});

/* ---------- directions, and the privacy rule ---------- */

test("directionsUrl: a published address produces a maps link", () => {
  const url = t.directionsUrl({ address: "211 Grove Street", locality: "Boulder Creek" });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(url, /211%20Grove%20Street/);
  assert.match(url, /Boulder%20Creek/);
});

test("directionsUrl: never generated for a service-based listing", () => {
  assert.equal(t.directionsUrl({ no_storefront: true, address: "123 Private Lane", locality: "Boulder Creek" }), "");
  assert.equal(t.directionsUrl({ address: null, locality: "Boulder Creek" }), "");
  assert.equal(t.directionsUrl(null), "");
});

test("no real service-based listing can produce a directions link", () => {
  const leaks = listings.filter((l) => l.no_storefront && t.directionsUrl(l));
  assert.deepEqual(leaks.map((l) => l.name), []);
});

/* ---------- card rendering ---------- */

test("listingCard renders the badge, the licence and a directions link", () => {
  const html = t.listingCard({
    name: "Test Electric",
    category: "Electrical & Solar",
    locality: "Boulder Creek",
    address: "13000 Highway 9",
    license: "CSLB #814852 (active, C-20)",
    phone: "831-555-0100",
  });
  assert.match(html, /bcl-dir-badge is-bc/);
  assert.match(html, /In Boulder Creek/);
  assert.match(html, /CSLB #814852/);
  assert.match(html, /Directions/);
});

test("listingCard omits directions and marks a mobile trade as based here", () => {
  const html = t.listingCard({
    name: "Test Septic",
    category: "Home Services & Repair",
    locality: "Boulder Creek",
    no_storefront: true,
    address: null,
  });
  assert.match(html, /Boulder Creek based, mobile/);
  assert.equal(/Directions/.test(html), false);
  assert.equal(/maps\/dir/.test(html), false);
});

test("listingCard escapes a hostile name rather than emitting markup", () => {
  const html = t.listingCard({ name: '<img src=x onerror=alert(1)>', locality: "Felton" });
  assert.equal(/<img src=x/.test(html), false);
  assert.match(html, /&lt;img/);
});
