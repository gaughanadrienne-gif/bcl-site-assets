# Jobs & Rentals Rendering — Implementation Plan (Plan 5 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Render the jobs and rentals boards in the existing `bcl-tools.js` widget: a `#bcl-jobs` view (Local / Remote tabs, keyword + category filter, cards showing pay-or-"Pay not listed", commute, apply-at-source) and a `#bcl-rentals` view (keyword + beds + verified-only filter, cards with a 95006 badge, rent, beds/baths, last-verified). Plus a local preview harness so the boards can be viewed/screenshotted before launch, and paste-ready Squarespace embeds.

**Architecture:** Follow the widget's established pattern exactly (ES5 IIFE, `boot()` wires each `#bcl-*` div to an init function, pure helpers exported via `module.exports` for `node:test`, brand CSS injected by `injectCSS`, data fetched from `REPO + "/data/*.json"`). Add a `window.BCL_REPO` override so a local harness can point `REPO` at the working tree for preview/screenshot without affecting production (default stays jsDelivr `@main`). Pure filter/card functions are node-tested; the DOM `init*` functions follow the proven `initListings` shape and are exercised by the preview harness.

**Tech Stack:** Vanilla ES5 JavaScript (no build step, no framework — match the existing file), `node:test` for the pure helpers, Python `http.server` for the local preview.

## Global Constraints

- Working dir: repo root. Branch `feature/jobs-rentals-tools`. Do not push.
- **Match the existing `tools/bcl-tools.js` style:** ES5 (`var`, `function`), no ES6+ syntax, no dependencies, use the existing `esc()` and `fetchJSON()` and CSS-variable-free brand colors already in `injectCSS`. Do not restructure existing code; only add.
- **Brand:** forest `#173f36`, fern `#2f6754`, clay `#d56e47` (actions), cream `#f5f1e7`, paper `#fffdf8`, ink `#1c2a26`, muted `#67716b`; Cormorant Garamond headings, Inter body, IBM Plex Mono labels. No em-dashes, no emojis. Reuse the existing `.bcl-*` classes where possible.
- **Trust (spec 6/trust rules):** every card shows its `source` and a last-verified date; every board carries the "Boulder Creek Local is not the employer / not the landlord, verify independently" disclaimer; rentals board carries the scam-safety + fair-housing note. A missing field renders as blank/"not listed", never a guess.
- **Jobs: remote is a SEPARATE tab** from local; extended-tier jobs are hidden from the default Local view behind an "Include extended commute" toggle. **Rentals:** default view shows verified 95006 listings; "queued/pending" listings are NOT rendered (they live in the private review queue).
- Data shapes are the public schemas from spec §7 (already produced by plans 3-4 into `data/jobs.json`, `data/rentals.json`).
- Commit after each task with the standard trailers.

---

## Task 1: REPO override + jobs pure helpers

**Files:** Modify `tools/bcl-tools.js`; Test `tools/tests/jobs-render.test.js`

**Interfaces — Produces (added to `module.exports`):**
- `jobTab(job) -> "remote" | "local"` — "remote" if `geography_tier === "remote"`, else "local".
- `filterJobs(rows, opts) -> list` — `opts = {tab, q, category, includeExtended}`. Keeps rows matching tab; when `tab==="local"` drops `geography_tier==="extended"` unless `includeExtended`; keyword `q` matches title/employer/city (case-insensitive); `category` exact-matches when set. Sorts: verified first, then newest `posted_at` (empty dates last), then title.
- `jobSalaryText(job) -> str` — `job.salary_text` if `salary_disclosed`, else "Pay not listed".
- `jobCard(job) -> htmlString` — a `.bcl-job-card` with title (linked to `canonical_url`), employer, city + tier badge, commute ("~N min" when `commute_minutes` set and not remote), employment type, `jobSalaryText`, posted/first-seen, last-verified, "Apply at source" button (→ canonical_url), and a report link. Uses `esc()`.

Also modify the `REPO` line to: `var REPO = (typeof window !== "undefined" && window.BCL_REPO) || "https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main";`

- [ ] **Step 1: Write failing tests** — `tools/tests/jobs-render.test.js`:

```js
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
```

- [ ] **Step 2: Run — expect FAIL.** `node --test tools/tests/jobs-render.test.js`
- [ ] **Step 3: Implement** the REPO override and the four helpers inside the IIFE (ES5), and add them to the `module.exports` object. Follow `listingCard`/`buildDirectoryHTML` style; reuse `esc()`.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(render): jobs filter + card helpers + REPO override`.

---

## Task 2: rentals pure helpers

**Files:** Modify `tools/bcl-tools.js`; Test `tools/tests/rentals-render.test.js`

**Interfaces — Produces (exported):**
- `filterRentals(rows, opts) -> list` — `opts = {q, minBeds, verifiedOnly}`. keyword matches headline/city/property_type; `minBeds` keeps `bedrooms >= minBeds`; `verifiedOnly` keeps `verification_status === "verified"`. Sort: verified first, then newest `first_seen_at`, then rent ascending.
- `rentalCard(rental) -> htmlString` — `.bcl-rental-card` with headline, a "95006" badge, monthly rent ("$X,XXX/mo" or "Contact for rent"), beds/baths, property type, available date, furnished when set, last-verified, source/property_manager, "View original" (→ canonical_url), report link. `esc()` throughout.

- [ ] **Step 1: Write failing tests** — `tools/tests/rentals-render.test.js` with 2-3 sample rentals; assert `filterRentals` respects minBeds + verifiedOnly + keyword; `rentalCard` shows headline, "95006", rent or "Contact for rent" when `monthly_rent` falsy, the canonical_url, and no "undefined".
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(render): rentals filter + card helpers`.

---

## Task 3: initJobs + initRentals wiring + CSS + boot

**Files:** Modify `tools/bcl-tools.js`

- [ ] **Step 1:** Add `initJobs(root)`: `fetchJSON(REPO + "/data/jobs.json")`, build controls (Local/Remote tab buttons, a keyword input, a category `<select>` from distinct `category` values, an "Include extended commute" checkbox on the Local tab), a count line, and a list container; a `render()` closure calls `filterJobs` and joins `jobCard`; wire `input`/`change`/tab-click listeners; show the not-the-employer disclaimer; on fetch failure call `unavailable(root, ...)`. Mirror `initListings`/`initEvents`.
- [ ] **Step 2:** Add `initRentals(root)`: `fetchJSON(REPO + "/data/rentals.json")`, controls (keyword input, min-beds `<select>` 0/1/2/3+, verified-only checkbox), count, list; `render()` uses `filterRentals` + `rentalCard`; show the scam-safety + fair-housing + not-the-landlord notice; empty state ("No verified 95006 rentals are listed right now.") via `unavailable` when zero. 
- [ ] **Step 3:** Extend `injectCSS` with `.bcl-job-card`, `.bcl-rental-card`, `.bcl-tabs`/`.bcl-tab`, `.bcl-badge`, and an apply/view button style, using the brand palette and reusing existing tokens. Bump the CSS id (`bcl-tools-css-v5`) so stale cached CSS is replaced (the file already removes prior `style[id^='bcl-tools-css']`).
- [ ] **Step 4:** In `boot()`, add: `var j = document.getElementById("bcl-jobs"); if (j) initJobs(j);` and `var rn = document.getElementById("bcl-rentals"); if (rn) initRentals(rn);`.
- [ ] **Step 5:** Run the full JS suite `node --test tools/tests/` and the Python suite `python -m pytest -q` — both green (JS render helpers + existing directory tests + all pipeline tests). **Commit** `feat(render): initJobs + initRentals wiring + CSS`.

---

## Task 4: local preview harness + Squarespace embeds

**Files:** Create `preview/jobs-preview.html`, `preview/rentals-preview.html`, `preview/README.md`; Create `docs/embeds/jobs-embed.html`, `docs/embeds/rentals-embed.html`

- [ ] **Step 1:** `preview/jobs-preview.html` — a minimal page that sets `window.BCL_REPO = ".."` (so `REPO` resolves to the repo root when served from `preview/`), includes `<div id="bcl-jobs"></div>`, and loads `<script src="../tools/bcl-tools.js"></script>`. Same for `preview/rentals-preview.html` with `#bcl-rentals`. `preview/README.md` documents: run `python -m http.server 8080` from the repo root, open `http://localhost:8080/preview/jobs-preview.html` (requires a local `data/jobs.json` from a refresh run).
- [ ] **Step 2:** `docs/embeds/jobs-embed.html` and `rentals-embed.html` — the paste-ready Squarespace code-block snippets: `<div id="bcl-jobs"></div>` (resp. `#bcl-rentals`) + `<script src="https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/tools/bcl-tools.js" defer></script>`, with a comment noting to also add crawlable intro copy outside the widget.
- [ ] **Step 3: Preview smoke (manual/local):** start `python -m http.server 8080` in the repo root, fetch `http://localhost:8080/preview/jobs-preview.html` and confirm HTTP 200 and that the page references the widget; if a headless screenshot tool is available, capture `preview/jobs-preview.html` and `preview/rentals-preview.html` for the report. (Requires local `data/jobs.json` + `data/rentals.json` from prior refresh runs.)
- [ ] **Step 4: Commit** `feat(render): local preview harness + Squarespace embed snippets` (do NOT commit data/*.json).

---

## Self-Review Notes

- **Jobs render (spec 15):** Local/Remote tabs, keyword+category filter, pay-or-"Pay not listed", commute, apply-at-source, source + last-verified — Tasks 1,3.
- **Extended hidden by default (spec 5.1):** `filterJobs` drops extended from Local unless toggled — Task 1 (closes the plan-3 reviewer's note that the renderer must enforce this).
- **Remote separated (spec 5.3/10):** `jobTab` + tab UI — Tasks 1,3.
- **Rentals render (spec 25):** 95006 badge, rent, beds/baths, verified-only, last-verified, view-original — Tasks 2,3.
- **Queue never rendered:** the widget reads only `data/*.json` (published), never `review/*.json` — inherent.
- **Trust/disclaimers (spec 6):** not-the-employer / not-the-landlord + scam-safety + fair-housing notices — Task 3.
- **Preview + embeds:** Task 4 gives a screenshot-able local board and the owner's paste-ready page snippets.
- **Deferred (follow-up):** the fuller spec filter sets (salary range, pets, furnished, employment-type facets), "employers hiring" tab, JobPosting JSON-LD — additive later; the MVP render is functional and on-brand.
- **Placeholder note:** Task 3's `init*` DOM functions follow the existing `initListings` shape (proven) and are validated by the preview harness rather than unit tests, consistent with how the existing directory/events renderers are structured.
