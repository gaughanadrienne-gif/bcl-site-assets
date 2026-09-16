const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const tool = require(path.join(__dirname, "../bcl-tools.js"));
const source = fs.readFileSync(path.join(__dirname, "../bcl-tools.js"), "utf8");

const TODAY = new Date(2026, 8, 16);

test("correction links preserve a card name and source URL in reference", () => {
  const href = tool.correctionHref("Scarborough Home & Garden", "https://example.com/a?b=1&c=2");
  const url = new URL(href, "https://www.bouldercreeklocal.com");
  assert.equal(url.searchParams.get("topic"), "correction");
  assert.equal(url.searchParams.get("reference"), "Scarborough Home & Garden\nhttps://example.com/a?b=1&c=2");
});

test("directory cards carry a named correction link and accessible repeated links", () => {
  const html = tool.listingCard({
    name: "Scarborough Home & Garden",
    locality: "Boulder Creek",
    description: "Hardware and garden supplies.",
    website: "https://example.com",
    phone: "831-555-0100",
    verified_at: "2026-09-16"
  });
  assert.match(html, /topic=correction&amp;reference=/);
  assert.match(html, /aria-label="Website for Scarborough Home &amp; Garden"/);
  assert.match(html, /aria-label="Call Scarborough Home &amp; Garden at 831-555-0100"/);
});

test("job deadlines parse written, ISO and US numeric formats", () => {
  assert.equal(tool.jobDeadlineText("Friday, September 18, 2026 11:59 PM", TODAY),
    "Applications close Friday, September 18");
  assert.equal(tool.jobDeadlineText("2026-09-25", TODAY),
    "Applications close Friday, September 25");
  assert.equal(tool.jobDeadlineText("09/30/2026", TODAY),
    "Applications close Wednesday, September 30");
  assert.equal(tool.jobDeadlineText("Continuous", TODAY), "");
  assert.equal(tool.jobDeadlineText("Until Filled", TODAY), "");
  assert.equal(tool.jobDeadlineText("By Date", TODAY), "");
});

test("County jobs group under one employer while retaining the department", () => {
  const county = { source: "County of Santa Cruz", employer_name: "Parks" };
  assert.equal(tool.jobEmployerName(county), "County of Santa Cruz");
  assert.equal(tool.jobDepartmentName(county), "Parks");
  assert.deepEqual(tool.jobEmployers([
    county,
    { source: "County of Santa Cruz", employer_name: "Sheriff-Coroner" },
    { source: "Other", employer_name: "Mount Hermon" }
  ]), ["County of Santa Cruz", "Mount Hermon"]);
});

test("job cards show normalized employer, department, deadline and correction reference", () => {
  const html = tool.jobCard({
    title: "Aquatics Supervisor",
    source: "County of Santa Cruz",
    employer_name: "Parks",
    city: "Santa Cruz",
    geography_tier: "core",
    employment_type: "Full Time",
    salary_text: "$35/hr",
    salary_disclosed: true,
    posted_at: "2026-09-10",
    application_deadline: "Friday, September 18, 2026 11:59 PM",
    canonical_url: "https://example.com/job",
    last_verified_at: "2026-09-16",
    verification_status: "verified"
  }, TODAY);
  assert.match(html, /County of Santa Cruz · Parks/);
  assert.match(html, /Applications close Friday, September 18/);
  assert.match(html, /aria-label="Apply for Aquatics Supervisor at County of Santa Cruz"/);
  assert.match(html, /topic=correction&amp;reference=/);
});

test("deadline-only job cards do not call a dated recruitment ongoing", () => {
  const html = tool.jobCard({
    title: "Aquatics Supervisor",
    source: "County of Santa Cruz",
    employer_name: "Parks",
    city: "Santa Cruz",
    geography_tier: "core",
    salary_text: "$35/hr",
    salary_disclosed: true,
    posted_at: "",
    first_seen_at: "2026-09-13",
    application_deadline: "Friday, September 18, 2026 11:59 PM",
    canonical_url: "https://example.com/job",
    last_verified_at: "2026-09-16",
    verification_status: "verified"
  }, TODAY);
  assert.match(html, /Posting date not provided/);
  assert.match(html, /Applications close Friday, September 18/);
  assert.doesNotMatch(html, /Ongoing recruitment/);
});

test("rental availability becomes resident-facing date text", () => {
  assert.equal(tool.rentalAvailableText("NOW", TODAY), "Available now");
  assert.equal(tool.rentalAvailableText("September 1", TODAY), "Available now");
  assert.equal(tool.rentalAvailableText("09-29-2026", TODAY), "Available September 29");
  assert.equal(tool.rentalAvailableText("date pending", TODAY), "Available: date pending");
});

test("rental cards render square feet, shared-room scope and correction reference", () => {
  const html = tool.rentalCard({
    headline: "Room near downtown",
    locality: "Boulder Creek",
    city: "Boulder Creek",
    monthly_rent: 1750,
    bedrooms: 1,
    bathrooms: 1,
    square_feet: 350,
    property_type: "Room",
    rental_scope: "private-room",
    available_date: "NOW",
    canonical_url: "https://example.com/rental",
    source: "Property manager",
    last_verified_at: "2026-09-16"
  }, TODAY);
  assert.match(html, /1 bd · 1 ba · 350 sq ft/);
  assert.match(html, /Room in a shared home/);
  assert.match(html, /Available now/);
  assert.match(html, /aria-label="View the original listing for Room near downtown"/);
  assert.match(html, /topic=correction&amp;reference=/);
});

test("same-day event cards show end time and specific accessible actions", () => {
  const event = {
    id: "event-1",
    title: "Community workshop",
    start: "2026-09-17T13:30",
    end: "2026-09-17T17:30",
    location: "Boulder Creek Library",
    category: "Community",
    url: "https://example.com/event"
  };
  assert.equal(tool.evEndSuffix(event), " to 5:30 PM");
  const html = tool.eventCard(event);
  assert.match(html, /1:30 PM to 5:30 PM/);
  assert.match(html, /aria-label="Details for Community workshop"/);
  assert.match(html, /aria-label="Add Community workshop to your calendar"/);
  assert.match(html, /Report a correction/);
});

test("search excludes past event instances but preserves ongoing and future events", () => {
  const records = [
    { t: "event", n: "Past concert", s: "2026-09-01 Town" },
    { t: "event", n: "Future concert", s: "2026-09-20 Town" },
    { t: "event", n: "Museum exhibit", s: "2026-07-01 Ongoing exhibit" },
    { t: "business", n: "Past Times", s: "Shop" }
  ];
  const events = [
    { title: "Past concert", start: "2026-09-01" },
    { title: "Future concert", start: "2026-09-20" },
    { title: "Museum exhibit", start: "2026-07-01", end: "2026-12-31" }
  ];
  assert.deepEqual(tool.filterCurrentSearchRecords(records, events, TODAY).map((r) => r.n),
    ["Future concert", "Museum exhibit", "Past Times"]);
});

test("search distinguishes past and future recurrences with the same title", () => {
  const records = [
    { t: "event", n: "Boulder Creek Farmers Market", s: "2026-09-10 Junction Park" },
    { t: "event", n: "Boulder Creek Farmers Market", s: "2026-09-17 Junction Park" },
    { t: "event", n: "Boulder Creek Farmers Market", s: "2026-09-24 Junction Park" }
  ];
  const events = [
    { title: "Boulder Creek Farmers Market", start: "2026-09-10T16:00" },
    { title: "Boulder Creek Farmers Market", start: "2026-09-17T16:00" },
    { title: "Boulder Creek Farmers Market", start: "2026-09-24T16:00" }
  ];
  assert.deepEqual(tool.filterCurrentSearchRecords(records, events, TODAY).map((r) => r.s),
    ["2026-09-17 Junction Park", "2026-09-24 Junction Park"]);
});

test("the strongest exact-name group appears before a page body mention", () => {
  const hits = tool.searchRecords([
    { t: "page", n: "Visit Boulder Creek", s: "", k: "Walk past Scarborough shops" },
    { t: "business", n: "Scarborough Building Supply", s: "", k: "" },
    { t: "article", n: "A local walk", s: "Scarborough is on the route", k: "" }
  ], "scarborough", 10);
  assert.equal(tool.groupHits(hits)[0].type, "business");
});

test("search dialog traps Tab and card descriptions no longer clip", () => {
  assert.match(source, /e\.key === "Tab"/);
  assert.match(source, /document\.activeElement === last/);
  assert.match(source, /\.bcl-dir-desc\{[^}]*display:block;overflow:visible;max-height:none/);
  assert.doesNotMatch(source, /\.bcl-dir-desc\{[^}]*-webkit-line-clamp:3/);
  assert.match(source, /\.bcl-job-card \.bcl-actionrow a,[^{]+\{color:#b04a2c !important;\}/);
});
