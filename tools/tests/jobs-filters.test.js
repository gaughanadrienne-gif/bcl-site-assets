const test = require("node:test");
const assert = require("node:assert");
const t = require("../bcl-tools.js");

const TODAY = "2026-07-29";

const JOBS = [
  { title: "Line Cook", employer_name: "New Leaf", city: "Felton", geography_tier: "core",
    salary_min: 23.19, salary_max: 23.19, salary_period: "hour", salary_text: "$23.19 Per Hour",
    salary_disclosed: true, posted_at: "2026-07-27", first_seen_at: "2026-07-29",
    canonical_url: "https://x/1", verification_status: "verified" },
  { title: "Teacher", employer_name: "San Lorenzo Valley Unified", city: "Boulder Creek", geography_tier: "core",
    salary_min: 66888, salary_max: 89652, salary_period: "year", salary_text: "$66,888.00 - $89,652.00 Annually",
    salary_disclosed: true, posted_at: "2026-06-01", first_seen_at: "2026-07-29",
    canonical_url: "https://x/2", verification_status: "verified" },
  { title: "Analyst", employer_name: "County of Santa Cruz", city: "Santa Cruz", geography_tier: "core",
    salary_min: 9396, salary_max: 11431, salary_period: "month", salary_text: "$9,396 - 11,431 / Month",
    salary_disclosed: true, posted_at: "", first_seen_at: "2026-07-29",
    canonical_url: "https://x/3", verification_status: "verified" },
  { title: "Substitute", employer_name: "San Lorenzo Valley Unified", city: "Felton", geography_tier: "core",
    salary_min: 165, salary_max: 165, salary_period: "", salary_text: "$165 Daily",
    salary_disclosed: true, posted_at: "2026-07-28", first_seen_at: "2026-07-29",
    canonical_url: "https://x/4", verification_status: "verified" },
  { title: "Barista", employer_name: "Big Basin Cafe", city: "Boulder Creek", geography_tier: "core",
    salary_min: null, salary_max: null, salary_period: "", salary_text: "",
    salary_disclosed: false, posted_at: "2026-07-28", first_seen_at: "2026-07-29",
    canonical_url: "https://x/5", verification_status: "verified" },
];

const titles = rows => rows.map(j => j.title).sort();

test("hourly equivalents use full-time conversions from the bottom of the range", () => {
  assert.equal(t.jobHourlyEquivalent(JOBS[0]).toFixed(2), "23.19");
  assert.equal(t.jobHourlyEquivalent(JOBS[1]).toFixed(2), (66888 / 2080).toFixed(2));
  assert.equal(t.jobHourlyEquivalent(JOBS[2]).toFixed(2), (9396 / 173.33).toFixed(2));
});
test("pay with no honest hourly equivalent stays out of the bands", () => {
  assert.equal(t.jobHourlyEquivalent(JOBS[3]), null, "a daily rate has no known hours behind it");
  assert.equal(t.jobHourlyEquivalent(JOBS[4]), null, "undisclosed pay is not a number");
  assert.equal(t.jobHourlyEquivalent({ salary_disclosed: true, salary_period: "hour", salary_min: 0 }), null);
});
test("Pay listed keeps only postings that name a rate", () => {
  const rows = t.filterJobs(JOBS, { tab: "local", payListedOnly: true });
  assert.equal(rows.indexOf(JOBS[4]), -1);
  assert.equal(rows.length, 4);
});
test("a pay band excludes lower pay and anything unconvertible", () => {
  /* $66,888 a year is $32.16 an hour, so the teacher clears the $30 band and
     the line cook at $23.19 does not. */
  assert.deepEqual(titles(t.filterJobs(JOBS, { tab: "local", minHourly: 30 })), ["Analyst", "Teacher"]);
  assert.deepEqual(titles(t.filterJobs(JOBS, { tab: "local", minHourly: 20 })), ["Analyst", "Line Cook", "Teacher"]);
  assert.deepEqual(titles(t.filterJobs(JOBS, { tab: "local", minHourly: 25 })), ["Analyst", "Teacher"]);
  assert.equal(titles(t.filterJobs(JOBS, { tab: "local", minHourly: 20 })).indexOf("Substitute"), -1,
    "a daily rate is never guessed into a band");
});
test("the employer filter is exact, not a substring match", () => {
  assert.deepEqual(titles(t.filterJobs(JOBS, { tab: "local", employer: "San Lorenzo Valley Unified" })),
    ["Substitute", "Teacher"]);
  assert.deepEqual(t.filterJobs(JOBS, { tab: "local", employer: "San Lorenzo" }), []);
});
test("employer options come from the data, sorted, no duplicates", () => {
  assert.deepEqual(t.jobEmployers(JOBS),
    ["Big Basin Cafe", "County of Santa Cruz", "New Leaf", "San Lorenzo Valley Unified"]);
  assert.deepEqual(t.jobEmployers([{ employer_name: "" }, {}, null]), []);
});
test("Posted this week uses the employer date and falls back to first seen", () => {
  const rows = t.filterJobs(JOBS, { tab: "local", postedWithinDays: 7, today: TODAY });
  assert.deepEqual(titles(rows), ["Analyst", "Barista", "Line Cook", "Substitute"]);
  assert.equal(titles(rows).indexOf("Teacher"), -1, "posted in June, so not this week");
  assert.equal(t.jobDateKey(JOBS[2]), "2026-07-29", "no posted_at, so the date we first saw it");
});
test("a posting with no date at all is not claimed to be fresh", () => {
  const undated = { title: "Ghost", employer_name: "X", geography_tier: "core", posted_at: "", first_seen_at: "" };
  assert.equal(t.jobPostedWithin(undated, 7, TODAY), false);
});
test("the new filters stack with the existing local/remote mechanics", () => {
  const extended = { title: "Warehouse", employer_name: "BigCo", geography_tier: "extended",
    salary_min: 31, salary_period: "hour", salary_disclosed: true, posted_at: "2026-07-28" };
  const rows = JOBS.concat([extended]);
  assert.deepEqual(titles(t.filterJobs(rows, { tab: "local", minHourly: 30 })), ["Analyst", "Teacher"]);
  assert.deepEqual(titles(t.filterJobs(rows, { tab: "local", minHourly: 30, includeExtended: true })),
    ["Analyst", "Teacher", "Warehouse"]);
});
test("no filter is set by default, so the board still opens on everything local", () => {
  assert.equal(t.filterJobs(JOBS, { tab: "local" }).length, 5);
});
test("the published bands are the ones the control offers", () => {
  assert.deepEqual(t.PAY_BANDS, [20, 25, 30]);
});
