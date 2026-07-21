const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const EVENTS = [
  { title: "Past Thing", start: "2026-07-01", end: null, category: "Community" },
  { title: "Long Exhibit", start: "2026-07-10", end: "2026-08-30", category: "Music & Arts" },
  { title: "Farmers Market", start: "2026-07-22T09:00", end: null, location: "Hwy 9", category: "Markets" },
  { title: "Concert", start: "2026-07-25T19:00", end: null, category: "Music & Arts" },
  { title: "Fire Meeting", start: "2026-08-04", end: null, category: "Community" },
];

test("nextEvents keeps upcoming and still-running events, soonest first", () => {
  assert.deepEqual(
    t.nextEvents(EVENTS, "2026-07-21", 3).map((e) => e.title),
    ["Long Exhibit", "Farmers Market", "Concert"]
  );
});
test("nextEvents drops events that already ended", () => {
  const titles = t.nextEvents(EVENTS, "2026-07-21", 10).map((e) => e.title);
  assert.ok(!titles.includes("Past Thing"));
});
test("nextEvents returns empty when nothing is upcoming", () => {
  assert.deepEqual(t.nextEvents(EVENTS, "2027-01-01", 3), []);
  assert.deepEqual(t.nextEvents(null, "2026-07-21", 3), []);
});

const JOBS = [
  { title: "Barista", employer_name: "Cafe", city: "Boulder Creek", geography_tier: "core",
    employment_type: "Part-Time", salary_text: "$18/hr", salary_disclosed: true, posted_at: "2026-07-20",
    canonical_url: "https://x/1", verification_status: "verified", category: "Food" },
  { title: "Clerk", employer_name: "Market", city: "Felton", geography_tier: "core",
    employment_type: "Full-Time", salary_text: "", salary_disclosed: false, posted_at: "2026-07-15",
    canonical_url: "https://x/2", verification_status: "verified", category: "Retail" },
  { title: "Driver", employer_name: "BigCo", city: "San Jose", geography_tier: "extended",
    employment_type: "Full-Time", salary_text: "$25/hr", salary_disclosed: true, posted_at: "2026-07-19",
    canonical_url: "https://x/3", verification_status: "verified", category: "Ops" },
  { title: "Remote Dev", employer_name: "Acme", city: "", geography_tier: "remote",
    employment_type: "Full-Time", salary_text: "", salary_disclosed: false, posted_at: "2026-07-21",
    canonical_url: "https://x/4", verification_status: "verified", category: "Tech" },
];

test("homeJobs prefers local, newest first, and never shows remote", () => {
  assert.deepEqual(t.homeJobs(JOBS, 2).map((j) => j.title), ["Barista", "Clerk"]);
});
test("homeJobs widens to extended commute only when local is thin", () => {
  assert.deepEqual(t.homeJobs(JOBS, 3).map((j) => j.title), ["Barista", "Driver", "Clerk"]);
});
test("homeJobCard shows employer, title, pay fallback, and no undefined", () => {
  const html = t.homeJobCard(JOBS[1]);
  assert.ok(html.includes("Market"));
  assert.ok(html.includes("Clerk"));
  assert.ok(html.includes("Pay not listed"));
  assert.ok(html.includes("Posted 2026-07-15"));
  assert.ok(!html.includes("undefined"));
});

const RENTALS = [
  { headline: "123 Main, Boulder Creek", locality: "Boulder Creek", city: "Boulder Creek", monthly_rent: 2400,
    bedrooms: 2, bathrooms: 1, property_type: "Cottage", available_date: "Aug 1", first_seen_at: "2026-07-20",
    canonical_url: "https://r/1", verification_status: "verified" },
  { headline: "9 Creek Rd, Felton", locality: "Felton", city: "Felton", monthly_rent: null,
    bedrooms: 3, bathrooms: 2, property_type: "Single Family Home", first_seen_at: "2026-07-18",
    canonical_url: "https://r/2", verification_status: "verified" },
  { headline: "44 Alba, Ben Lomond", locality: "Ben Lomond", city: "Ben Lomond", monthly_rent: 1800,
    bedrooms: 1, bathrooms: 1, property_type: "Studio", first_seen_at: "2026-07-21",
    canonical_url: "https://r/3", verification_status: "unverified" },
];

test("homeRentals shows verified listings when there are enough", () => {
  assert.deepEqual(
    t.homeRentals(RENTALS, 2).map((r) => r.headline),
    ["123 Main, Boulder Creek", "9 Creek Rd, Felton"]
  );
});
test("homeRentals falls back to the full list rather than showing nothing", () => {
  const picked = t.homeRentals(RENTALS, 3).map((r) => r.headline);
  assert.equal(picked.length, 3);
  assert.ok(picked.includes("44 Alba, Ben Lomond"));
});
test("homeRentalCard formats rent, beds, and the contact fallback", () => {
  assert.ok(t.homeRentalCard(RENTALS[0]).includes("$2,400/mo"));
  assert.ok(t.homeRentalCard(RENTALS[0]).includes("2 bd · 1 ba"));
  assert.ok(t.homeRentalCard(RENTALS[1]).includes("Contact for rent"));
  assert.ok(!t.homeRentalCard(RENTALS[1]).includes("undefined"));
});
