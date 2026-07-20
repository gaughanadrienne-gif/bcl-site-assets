const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const RENTALS = [
  { headline: "12895 Highway 9, Boulder Creek", city: "Boulder Creek", postal_code: "95006",
    locality: "Boulder Creek",
    property_type: "Single Family Home", monthly_rent: 3600, bedrooms: 2, bathrooms: 1.5,
    available_date: "Immediately", furnished: false, canonical_url: "https://x/1",
    source: "PMI Santa Cruz", property_manager: "PMI Santa Cruz", first_seen_at: "2026-07-19",
    last_verified_at: "2026-07-19", verification_status: "verified" },
  { headline: "Cabin on Zayante", city: "Zayante", postal_code: "95006",
    locality: "",
    property_type: "Cottage", monthly_rent: null, bedrooms: 1, bathrooms: 1,
    available_date: "Aug 1", furnished: true, canonical_url: "https://x/2",
    source: "Craigslist", property_manager: "", first_seen_at: "2026-07-18",
    last_verified_at: "2026-07-18", verification_status: "unverified" },
  { headline: "3BR House, Ben Lomond", city: "Ben Lomond", postal_code: "95005",
    locality: "Ben Lomond",
    property_type: "House", monthly_rent: 4200, bedrooms: 3, bathrooms: 2,
    available_date: "Now", furnished: false, canonical_url: "https://x/3",
    source: "Zillow", property_manager: "", first_seen_at: "2026-07-19",
    last_verified_at: "2026-07-19", verification_status: "verified" },
  { headline: "1BR Apartment, Felton", city: "Felton", postal_code: "95018",
    locality: "Felton",
    property_type: "Apartment", monthly_rent: 2800, bedrooms: 1, bathrooms: 1,
    available_date: "Now", furnished: false, canonical_url: "https://x/4",
    source: "Streamline 831", property_manager: "Streamline 831", first_seen_at: "2026-07-19",
    last_verified_at: "2026-07-19", verification_status: "verified" },
];

test("filterRentals respects minBeds", () => {
  assert.deepEqual(t.filterRentals(RENTALS, { minBeds: 2 }).map(r => r.headline).sort(),
    ["12895 Highway 9, Boulder Creek", "3BR House, Ben Lomond"]);
});
test("filterRentals respects verifiedOnly", () => {
  assert.deepEqual(t.filterRentals(RENTALS, { verifiedOnly: true }).map(r => r.headline).sort(),
    ["12895 Highway 9, Boulder Creek", "1BR Apartment, Felton", "3BR House, Ben Lomond"]);
});
test("filterRentals keyword matches headline/city/property_type", () => {
  assert.deepEqual(t.filterRentals(RENTALS, { q: "cabin" }).map(r => r.headline), ["Cabin on Zayante"]);
  assert.deepEqual(t.filterRentals(RENTALS, { q: "cottage" }).map(r => r.headline), ["Cabin on Zayante"]);
  assert.deepEqual(t.filterRentals(RENTALS, { q: "zayante" }).map(r => r.headline), ["Cabin on Zayante"]);
});
test("rentalCard shows headline, town badge, rent or Contact for rent, canonical_url, no undefined", () => {
  const withRent = t.rentalCard(RENTALS[0]);
  assert.ok(withRent.indexOf("12895 Highway 9, Boulder Creek") >= 0);
  assert.ok(withRent.indexOf("Boulder Creek") >= 0);
  assert.ok(withRent.indexOf("$3,600") >= 0);
  assert.ok(withRent.indexOf("https://x/1") >= 0);
  assert.equal(withRent.indexOf("undefined"), -1);

  const noRent = t.rentalCard(RENTALS[1]);
  assert.ok(noRent.indexOf("Contact for rent") >= 0);
  assert.equal(noRent.indexOf("undefined"), -1);
});
test("rentalCard shows the locality town badge when set", () => {
  const card = t.rentalCard(RENTALS[2]);
  assert.ok(card.indexOf('<span class="bcl-badge">Ben Lomond</span>') >= 0);
});
test("rentalCard falls back to postal_code badge when locality is empty", () => {
  const card = t.rentalCard(RENTALS[1]);
  assert.ok(card.indexOf('<span class="bcl-badge">95006</span>') >= 0);
});
test("filterRentals with town returns only matching-locality rentals", () => {
  assert.deepEqual(t.filterRentals(RENTALS, { town: "Felton" }).map(r => r.headline),
    ["1BR Apartment, Felton"]);
});
test("filterRentals with town 'all' or empty returns every rental", () => {
  assert.equal(t.filterRentals(RENTALS, { town: "all" }).length, RENTALS.length);
  assert.equal(t.filterRentals(RENTALS, { town: "" }).length, RENTALS.length);
});
