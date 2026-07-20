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
