const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const tools = require("../bcl-tools.js");

const SRC = fs.readFileSync(path.join(__dirname, "../bcl-tools.js"), "utf8");

test("job cards distinguish Valley, Nearby, and Extended commute without changing eligibility", () => {
  for (const city of ["Boulder Creek", "Brookdale", "Ben Lomond", "Felton", "Mount Hermon"]) {
    assert.equal(tools.jobAreaLabel({ city, geography_tier: "core" }), "Valley", city);
  }
  assert.equal(tools.jobAreaLabel({ city: "Santa Cruz", geography_tier: "core" }), "Nearby");
  assert.equal(tools.jobAreaLabel({ city: "San Jose", geography_tier: "extended" }), "Extended commute");
  assert.equal(tools.jobAreaLabel({ city: "Boulder Creek", geography_tier: "remote" }), "Remote");
});

test("Jobs keeps the short policy above filters and moves native detail below results", () => {
  const jobs = SRC.slice(SRC.indexOf("function arrangeJobsIntro"), SRC.indexOf("/* ---------- rentals"));
  assert.match(jobs, /Jobs in the valley and nearby communities/);
  assert.match(jobs, /<details class="bcl-job-about"><summary>About this board<\/summary>/);
  assert.match(jobs, /<div class="bcl-list"><\/div><div class="bcl-job-pagination">/);
  assert.ok(jobs.indexOf('class="bcl-job-about"') > jobs.indexOf('class="bcl-list"'));
  assert.match(jobs, /nativeIntroBlock\(root\)/);
  assert.match(jobs, /aboutSlot\.appendChild\(n\)/);
});

test("newsletter action uses approved dark clay in default, hover, and focus states", () => {
  assert.match(SRC, /\.bcl-letter-form button\.primary,\.bcl-letter-form button\.primary:hover,\.bcl-letter-form button\.primary:focus-visible\{background:#b04a2c !important;border-color:#b04a2c !important;color:#fff !important;\}/);
});

test("mobile search mounts in the header while desktop remains available after scroll", () => {
  const search = SRC.slice(SRC.indexOf("function initSiteSearch"), SRC.indexOf("function boot"));
  assert.match(search, /desktopButton\.classList\.add\("bcl-search-btn--desktop"\)/);
  assert.match(search, /document\.body\.appendChild\(desktopButton\)/);
  assert.match(search, /\.header-display-mobile/);
  assert.match(search, /mobileHost\.insertBefore\(mobileButton, mobileHost\.querySelector\("\.header-burger"\)\)/);
  assert.match(search, /document\.querySelector\("main"\) \|\| document\.body/);
  assert.match(SRC, /@media \(max-width:799px\)\{\.bcl-search-btn--desktop\{display:none;\}\.bcl-search-btn--mobile\{display:inline-flex;position:static/);
  assert.match(search, /aria-label", "Search Boulder Creek Local"/);
});
