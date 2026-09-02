const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const JOBS = [
  { title: "Line Cook", employer_name: "New Leaf", city: "Santa Cruz", geography_tier: "core",
    commute_minutes: 30, employment_type: "Full-Time", salary_text: "$20/hr", salary_disclosed: true,
    posted_at: "2026-07-18", canonical_url: "https://x/1", source: "NEOGOV", last_verified_at: "2026-07-19",
    verification_status: "verified", category: "Food" },
  { title: "Remote Dev", employer_name: "Acme", city: "", geography_tier: "remote", commute_minutes: null,
    employment_type: "Full-Time", salary_text: "", salary_disclosed: false, posted_at: "2026-07-19",
    canonical_url: "https://x/2", source: "Remotive (remote)", last_verified_at: "2026-07-19",
    verification_status: "verified", category: "Tech" },
  { title: "Warehouse", employer_name: "BigCo", city: "San Jose", geography_tier: "extended",
    commute_minutes: 45, employment_type: "Full-Time", salary_text: "$25/hr", salary_disclosed: true,
    posted_at: "2026-07-10", canonical_url: "https://x/3", source: "NEOGOV", last_verified_at: "2026-07-19",
    verification_status: "verified", category: "Ops" },
];

test("jobTab splits remote vs local", () => {
  assert.equal(t.jobTab(JOBS[0]), "local");
  assert.equal(t.jobTab(JOBS[1]), "remote");
});
test("filterJobs local hides extended by default, shows with toggle", () => {
  assert.deepEqual(t.filterJobs(JOBS, { tab: "local" }).map(j => j.title), ["Line Cook"]);
  assert.deepEqual(t.filterJobs(JOBS, { tab: "local", includeExtended: true }).map(j => j.title).sort(),
                   ["Line Cook", "Warehouse"]);
});
test("filterJobs remote tab only remote", () => {
  assert.deepEqual(t.filterJobs(JOBS, { tab: "remote" }).map(j => j.title), ["Remote Dev"]);
});
test("filterJobs keyword matches title/employer/city", () => {
  assert.deepEqual(t.filterJobs(JOBS, { tab: "local", includeExtended: true, q: "new leaf" }).map(j => j.title), ["Line Cook"]);
});
test("jobSalaryText falls back to Pay not listed", () => {
  assert.equal(t.jobSalaryText(JOBS[0]), "$20/hr");
  assert.equal(t.jobSalaryText(JOBS[1]), "Pay not listed");
});
test("jobCard includes title, employer, salary, apply link, no undefined", () => {
  const html = t.jobCard(JOBS[0]);
  assert.ok(html.indexOf("Line Cook") >= 0 && html.indexOf("New Leaf") >= 0);
  assert.ok(html.indexOf("$20/hr") >= 0 && html.indexOf("https://x/1") >= 0);
  assert.equal(html.indexOf("undefined"), -1);
});

/* Owner decision 2026-09-02: a posting date older than 180 days, or no posting date
   at all, is an open-ended recruitment rather than an expired listing. */
const TODAY = "2026-09-02";
test("jobPostedLine keeps a recent employer posting date", () => {
  assert.equal(t.jobPostedLine({ posted_at: "2026-08-20" }, TODAY), "Posted 2026-08-20");
});
test("jobPostedLine keeps a date exactly on the 180-day boundary", () => {
  assert.equal(t.jobPostedLine({ posted_at: "2026-03-06" }, TODAY), "Posted 2026-03-06");
});
test("jobPostedLine suppresses a date past 180 days", () => {
  assert.equal(t.jobPostedLine({ posted_at: "2024-08-02" }, TODAY), "Ongoing recruitment");
  assert.equal(t.jobPostedLine({ posted_at: "2026-03-03" }, TODAY), "Ongoing recruitment");
});
test("jobPostedLine says Ongoing recruitment when the source publishes no date", () => {
  // first_seen_at is rewritten on every refresh, so it is the refresh date and never
  // evidence of when a listing appeared. It must not be rendered as one.
  assert.equal(t.jobPostedLine({ posted_at: "", first_seen_at: TODAY }, TODAY), "Ongoing recruitment");
  assert.equal(t.jobPostedLine({}, TODAY), "Ongoing recruitment");
  assert.equal(t.jobPostedLine(null, TODAY), "Ongoing recruitment");
});
test("jobCard renders the stale date as Ongoing recruitment and never First seen", () => {
  const stale = t.jobCard({ ...JOBS[0], posted_at: "2024-08-02", first_seen_at: TODAY }, TODAY);
  assert.ok(stale.indexOf("Ongoing recruitment") >= 0);
  assert.equal(stale.indexOf("2024-08-02"), -1);
  assert.equal(stale.indexOf("First seen"), -1);
  const fresh = t.jobCard({ ...JOBS[0], posted_at: "2026-08-20" }, TODAY);
  assert.ok(fresh.indexOf("Posted 2026-08-20") >= 0);
  assert.equal(fresh.indexOf("Ongoing recruitment"), -1);
});
