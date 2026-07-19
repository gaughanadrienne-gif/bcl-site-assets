# Boulder Creek Local — Jobs & Rentals Tools

**Design spec (MVP)**
**Date:** 2026-07-19
**Status:** Approved for planning
**North-star reference:** the full 40-section implementation plan the owner supplied
(`bouldercreeklocaljobsrentalsimplementationplan.md`). This document is the **MVP
subset** we are actually building first; the full plan governs detailed field lists and
future phases.

---

## 1. Goal & guiding decisions

Add two continuously-updated community tools to Boulder Creek Local:

1. **Jobs** — local jobs across the practical Boulder Creek commute area (SLV + Scotts
   Valley + coastal Santa Cruz County), plus a **Remote jobs** tab for roles open to
   California residents.
2. **Rentals** — long-term residential rentals strictly within ZIP **95006**.

Owner decisions that shape this MVP:

- **Architecture: mirror the Exec Ops Brief (EOB) job board.** A local Python script pulls
  from authorized sources, writes a single public JSON file, commits/pushes to the
  `bcl-site-assets` repo, and purges the CDN. A Windows Task Scheduler task runs it daily.
  **No hosted backend, no database, no subdomain app.** This honors the 2026-07-15
  retired-backend directive and the static/jsDelivr portfolio pattern.
- **Build Jobs and Rentals together** for one combined launch (shared foundation first).
- **Job sources: local-first, no accounts.** Official government / education / employer
  career pages read with the `firecrawl` CLI (already on the machine). No paid
  aggregators, no API-key registration for the MVP. Commute is shown from a **static
  city→Boulder Creek time table**, not a live routing API.
- **Remote jobs are in the first launch** (sourced from free public remote-job feeds,
  filtered to California-eligible).
- **Top ~25 Santa Cruz County employers** are pulled directly from their career/ATS
  pages, geo-filtered to local worksites.

Non-goals (unchanged from the full plan): not a national board; no scraping of
LinkedIn / Indeed / Craigslist / Facebook / Nextdoor / Zillow et al. (discovery-only,
link out); no vacation rentals; no rentals outside 95006; never process applications;
never guarantee legitimacy, availability, or compliance.

---

## 2. Architecture (mirrors EOB, fits BCL)

Everything lives in the existing **`bcl-site-assets`** git repo (public; GitHub Pages +
jsDelivr). New layout:

```
jobs/
  refresh_jobs.py            # ingestion + filters + freshness + safety guard
  sources.py                 # jobs source registry (gov/edu/employer/remote)
  run_refresh_jobs.bat       # scrape -> git add/commit/push -> jsDelivr purge
rentals/
  refresh_rentals.py         # ingestion + 95006 validation + scam/fair-housing gates
  sources.py                 # rentals source registry (property managers, submissions)
  run_refresh_rentals.bat
shared/
  bcl_ingest.py              # fetch (firecrawl/http), sanitize, dedup, geo, JSON I/O,
                             # MIN_SAFE_TOTAL guard, listing-versioning helpers
data/
  jobs.json                  # PUBLIC, clean records (rendered by the widget)
  rentals.json               # PUBLIC, clean records
review/
  jobs-pending.json          # PRIVATE (gitignored) — queued for owner review
  rentals-pending.json       # PRIVATE (gitignored)
  review-board.html          # generated local approve/reject UI (logo-board pattern)
partials/
  manual-jobs.json           # hand-added rows (from /post-a-job submissions)
  manual-rentals.json        # hand-added rows (from /list-a-rental submissions)
  detail_cache.json          # gitignored per-URL verdict cache (freshness/comp)
tools/
  bcl-tools.js               # EXTENDED to render #bcl-jobs and #bcl-rentals
  tests/                     # pytest suites (EOB-style) + JS render tests
docs/superpowers/specs/      # this spec
```

**Rendering.** Extend the existing `bcl-tools.js` IIFE to render two new containers,
`#bcl-jobs` and `#bcl-rentals`, using the same inline-div pattern, brand CSS, and trust
conventions as `#bcl-directory` / `#bcl-food` / `#bcl-events`. One script tag, one embed
pattern across the whole site (no iframe). If `bcl-tools.js` grows unwieldy, split the
per-tool renderers into files concatenated at build time — but keep a single served
script and single embed contract.

**Publishing** (per tool, in the `.bat`, exactly the EOB mechanism):
```
python refresh_*.py >> refresh.log 2>&1
if errorlevel 1  -> STOP (guard tripped or failure); do NOT touch the live JSON
git add data/<tool>.json partials/…      (only public artifacts)
git commit -m "Daily <tool> refresh"     (no-op if unchanged)
git push
curl -s https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/<tool>.json
```

---

## 3. Data flow (per tool)

```
load source registry
for each enabled source (priority order):
    fetch via approved method (firecrawl CLI or plain HTTP)   # never bypass anti-bot
    normalize fields
    sanitize text / strip unsafe markup
    resolve + validate location
    apply tool inclusion rules
merge partials/manual-*.json (owner-approved submissions)
dedup + choose canonical source
enrich: fetch each listing's detail page for pay/hourly, benefits, hours/schedule,
        summary (cached + throttled + per-run cap; jobs are kept even when pay is absent)
score confidence; classify each record: AUTO-PUBLISH or QUEUE
verify previously-active records; expire stale ones (2-strike)
MIN_SAFE_TOTAL guard: if published set is implausibly small, refuse to overwrite + exit 1
write data/<tool>.json (public)  and  review/<tool>-pending.json (private)
```

This is the same shape as EOB's `main()`. The guard is the key safety net: a broken
scrape can never blank the live board.

**Public JSON is clean.** Internal-only state (dedup fingerprints, confidence scores,
raw hashes, verdict cache) stays in gitignored `partials/`/`review/` files, never in the
public `data/*.json`. Home-based / undisclosed addresses never expose a street address.
This matches the BCL data-flow rule and EOB's clean `roles.json`.

---

## 4. Human review without a backend (the one real adaptation)

BCL requires human review before publication; the full plan assumes a live moderation
dashboard. We achieve the same outcome with a **split-output** pipeline:

- **Auto-publish** — records from *authoritative* sources that pass every hard filter go
  straight to `data/<tool>.json`. Authoritative = official government/education job
  portals, verified employer ATS feeds, and verified property-manager rental pages. This
  matches EOB's auto-publish behavior and is safe because these sources are the canonical
  origin and the filters are conservative.
- **Queue for review** — anything ambiguous, community/employer/owner-submitted, or
  tripped by a scam / fair-housing / location-ambiguity flag is written to the private
  `review/<tool>-pending.json`.
- **Review board** — the refresh generates `review/review-board.html`, a self-contained
  tap-to-approve/reject page (the same local-board pattern already proven on the logo
  confirmations). The owner reviews in a browser; approvals are written to
  `partials/manual-*.json` and merge into the public JSON on the next run. Rejections are
  remembered so they don't re-queue.

Rentals lean heavily on the queue (scam risk); official-portal jobs lean auto-publish.

---

## 5. Jobs tool

### 5.1 Geography
- **Core cities (auto-included even when commute > 30 min):** Boulder Creek, Brookdale,
  Ben Lomond, Felton, Mount Hermon, Zayante, Lompico, Bonny Doon, Scotts Valley, Los Gatos
  (~25 min via Hwy 9/17), Santa Cruz, Live Oak, Capitola, Soquel, Aptos, Rio del Mar.
- **Extended area** (Davenport, Watsonville, Campbell, Santa Clara, San Jose, Monterey
  Bay): allowed only with a precise worksite and behind an **Extended commute** filter,
  hidden by default.
- **Commute display:** a **static lookup table** of typical drive minutes from downtown
  Boulder Creek (95006) to each core/extended city, labeled "approximate" (e.g., Los
  Gatos ~25, Scotts Valley ~20, Santa Cruz ~30, Felton ~12). No live routing API in the
  MVP. City-only listings show the city estimate; unknown worksites go to review. Never
  guess a worksite from employer HQ.

### 5.2 Sources (no accounts — all firecrawl or public HTTP)
- **Government:** County of Santa Cruz (`jobapscloud.com/scruz`), City of Santa Cruz &
  Scotts Valley & METRO (`governmentjobs.com` / NEOGOV), City of Capitola, BCRPD.
- **Education (EDJOIN portals):** SLVUSD, Live Oak, Santa Cruz City Schools, Soquel Union,
  SC County Office of Education, Scotts Valley USD, Pajaro Valley USD (extended); plus
  Cabrillo College and UC Santa Cruz HR pages; private schools (Mount Madonna, Gateway,
  Kirby) as onboarded.
- **Special districts + additional government:** SLV Water District, Scotts Valley Water
  District, Central Fire District of Santa Cruz County, Santa Cruz Public Libraries, City
  of Watsonville (extended) — mostly NEOGOV/governmentjobs.
- **Local / regional job boards (broader nets):** Santa Cruz Works
  (`santacruzworks.org/jobs`), Lookout Santa Cruz job board, SantaCruzJobs.com, Workforce
  Santa Cruz County. Read via firecrawl; each geo/quality-filtered like any other source.
- **Top ~25 SC County employers — direct ATS pull.** A curated watchlist, final list
  compiled and URL-verified as the first build task. Confident seeds by sector:
  - *Tech/manufacturing:* Joby Aviation, Google/Looker (Santa Cruz), HP/Poly (Scotts
    Valley), PayStand, Bay Photo, Fox Factory, Zero Motorcycles, Threshold Enterprises.
  - *Healthcare (large employers):* Dominican Hospital/CommonSpirit, Sutter/PAMF Santa
    Cruz, Kaiser (Scotts Valley/Santa Cruz), Central California Alliance for Health, Santa
    Cruz Community Health.
  - *Education/public:* UCSC, Cabrillo, County of Santa Cruz, City of Santa Cruz, METRO.
  - *Hospitality/recreation & very-local:* Santa Cruz Beach Boardwalk (Seaside Company),
    Roaring Camp Railroads (Felton), Boulder Creek Golf & Country Club, Chaminade, Dream
    Inn, 1440 Multiversity, Seascape, YMCA Camp Campbell.
  - *Finance/retail anchors:* Bay Federal Credit Union, Santa Cruz County Bank, New Leaf,
    Staff of Life, Nob Hill/Raley's, Safeway, Trader Joe's, Target.
  - *Big nonprofits:* Community Bridges, Second Harvest, Encompass, Housing Matters,
    Goodwill Central Coast.
  Each employer record stores its verified careers URL and detected **ATS type**
  (Greenhouse, Lever, Workday, Ashby, iCIMS, NEOGOV, etc.); most ATSs expose a
  structured/JSON board we read cleanly. **Multi-site employers are geo-filtered to their
  local worksite** — only roles sited in the service area appear.
- **Discovery-only (link out, never scraped):** LinkedIn, Indeed, Craigslist, Facebook,
  Nextdoor.

### 5.3 Remote jobs tab (in MVP)
- **Sources:** free public remote feeds — Remotive API, RemoteOK API, We Work Remotely
  RSS (all no-account).
- **Eligibility:** publish only when the role explicitly accepts **California** residents
  (or is unrestricted US-remote); drop roles that exclude CA. Roles requiring office
  attendance must site that office in the approved local geography.
- **Volume controls:** 100 active remote listings max; recency-ranked; per-category and
  per-employer caps so one occupation/company can't dominate; MLM/pay-to-start/lead-gen
  filtered out; commission-only prominently flagged.

### 5.4 Inclusion / exclusion / salary / detail / freshness
- Include FT/PT/temp/seasonal/contract/internship/apprenticeship/per-diem; volunteer only
  when clearly labeled and filtered separately.
- Exclude or review: MLM, pay-to-start, mystery shopping, reshipping, unverifiable
  employers, vague "work from phone," undisclosed commission-only, duplicate staffing-agency
  reqs, closed/expired, no application route, mistagged-local.

**Salary & decision-detail — BCL DIVERGES FROM EOB HERE.** EOB excludes any role without
disclosed comp and enforces a $100k floor. A local board must do the opposite: hourly
retail, trades, hospitality, and care jobs are core inventory, and many local employers
don't post pay.
- **No pay floor. Never drop a job for missing comp.** A job with no listed pay is still
  published, labeled "Pay not listed."
- **Actively surface pay when it exists.** An **enrichment step** fetches each listing's
  detail page (cached, throttled, capped per run — the EOB `enrich()` mechanism) to pull
  salary/hourly. Store exactly as disclosed; also normalize hourly/monthly/annual to
  comparable values for filtering and sorting; never invent or estimate a number.
- **Pay-transparency expectation (CA SB 1162):** employers with **15+ employees** must
  include a pay scale in the posting, so most mid/large postings (county, schools,
  hospitals, chains, top-25 employers) will carry a range. Employers under 15 are exempt,
  which is common for small SLV shops/trades/restaurants — their "Pay not listed" is
  expected and fine. But if a **known 15+ / watchlist employer** yields no pay, treat that
  as a likely **enrichment/parser miss, not a payless job**: flag it to the review queue
  so we can fix the parser rather than silently publish "Pay not listed."
- **Pull the rest of the decision-useful detail too,** so a resident can judge a role
  before clicking out: **benefits** (health, PTO, retirement — as stated), **hours /
  schedule** (FT/PT, shift, days, seasonal window), employment type, work mode, and a
  short factual summary. Each is surfaced when the source discloses it and omitted (not
  invented) when it doesn't.
- **Freshness labels:** New (≤3 days), Recent (≤7), Verified today/yesterday, Closing
  soon (deadline ≤3 days), Possibly closed (hidden + queued). **Expiration:** explicit
  closed status, OR two consecutive verification failures, OR deadline passed, OR source
  removed and no other active source remains.

### 5.5 SEO
Valid `JobPosting` JSON-LD on individual open roles only (visible content matches markup,
working canonical URL, `datePosted`/`validThrough` accurate). Never on search/list pages,
expired roles, or "always hiring" pages.

---

## 6. Rentals tool

### 6.1 Geography — strict 95006
Qualify only when: a full address geocodes to 95006, OR the source explicitly marks it
95006 with the address intentionally withheld, OR a verified landlord/manager confirms
95006. **A "Boulder Creek" label alone is not sufficient** (search pages bleed into 95005/
95007/95018). Reject other ZIPs. No public "nearby" section in the MVP.

### 6.2 Sources
- **Local property managers (highest priority, firecrawl-read direct pages):** Scotts
  Valley Property Management, Blue Sky, PMI Santa Cruz, Santa Cruz Property Management,
  Streamline 831, Bailey PM, Western PM, Kendall & Potter — plus additional AppFolio/
  Buildium pages serving 95006 onboarded over time.
- **National platforms (Zillow, Realtor, Redfin, Trulia, HotPads, Apartments.com,
  Homes.com):** discovery-only; link users to a filtered search, never scrape.
- **Community:** owner/manager/tenant submissions via form; local agent partnerships;
  bulletin tips — all through the review queue.

### 6.3 Safety (heavier than jobs)
- **Scam scoring → queue:** rent far below comps, pay-before-viewing, wire/gift-card/
  crypto/unusual deposit, overseas-owner-can't-show, copied images/description, mismatched
  identity, for-sale-not-for-rent, conflicting prices, no stable source URL, pressure to
  act, sensitive-data-before-verification.
- **Fair housing:** never solicit or publish protected-class preferences; flag
  potentially discriminatory wording for human review; never rewrite illegal restrictions
  into softer language and publish; provide a discrimination report reason; link HUD
  fair-housing resources in the submission flow.
- **Privacy:** never scrape personal phone/email from social platforms; publish contact
  only when the source/submitter provides it for the listing; never collect SSNs, bank
  details, government IDs, or screening docs; never process applications.

### 6.4 Property types, freshness, submissions
- Types: houses, apartments, condos, townhouses, duplexes, ADUs/cottages, studios, rooms/
  shared, furnished long-term, month-to-month, interim only if ≥30-day minimum. Tabs:
  All / Entire homes / Apartments & ADUs / Rooms & shared (don't mix rooms into entire-home
  results unless "All").
- Exclude: vacation/Airbnb/Vrbo, hotels, campsites, for-sale, commercial-only, housing-wanted,
  outside-95006, pay-for-address, unverifiable, duplicate syndication, expired/rented.
- **Freshness:** verify PM pages twice daily, submissions weekly, tips before publish + every
  3 days; one failure → `warning` + hidden from "verified only"; two failures → expired/
  rented + removed from default. **Owner submissions expire after 14 days**, renewal
  reminders day 10 + 13.

---

## 7. Public JSON schemas (simplified for static rendering)

Flattened from the full plan's DB tables. Internal-only fields live in private files.

**`data/jobs.json`** — `{ _note, updated, count, jobs: [ … ] }`, each job:
```
id, slug, title, title_original, employer_name, description_summary,
employment_type, work_mode(on-site|hybrid|remote), remote_regions[],
city, state, postal_code, location_precision, geography_tier(core|extended|remote),
commute_minutes, commute_type(approx), salary_min, salary_max, salary_period,
salary_text, salary_disclosed, benefits_text, hours_text, schedule,
category, posted_at, application_deadline,
canonical_url, source, first_seen_at, last_verified_at, verification_status, freshness_label
```

**`data/rentals.json`** — `{ _note, updated, count, rentals: [ … ] }`, each rental:
```
id, slug, headline, property_type, rental_scope(entire|private-room|shared),
address_public(nullable), city, state, postal_code(=95006), location_precision,
monthly_rent, total_monthly_price, deposit, application_fee, bedrooms, bathrooms,
square_feet, available_date, lease_term, minimum_stay_days(>=30), furnished,
pets_policy, utilities_text, parking_text, laundry_text, description_summary,
canonical_url, source, property_manager, first_seen_at, last_verified_at,
verification_status, freshness_label
```

---

## 8. Submissions, scheduling, testing

- **Submissions (no backend):** Squarespace native forms at `/post-a-job` and
  `/list-a-rental` deliver to hello@bouldercreeklocal.com. Owner verifies, approves into
  `partials/manual-*.json`; merged on the next refresh. Employer/landlord listings carry a
  30-day (jobs) / 14-day (rentals) expiry and a renewal link.
- **Scheduling (Task Scheduler + `.bat`, `America/Los_Angeles`, full exe paths per the
  portfolio Task Scheduler rule):** jobs daily **6:00am PT**; rentals **6:05am + 2:05pm
  PT**; weekly maintenance **Sunday 2:00am PT** (archive expired, re-evaluate duplicates,
  refresh source-health, prune subscribers, back up). Registered via `schtasks`, verified
  with `Start-ScheduledTask` + RestartCount.
- **Error handling:** per-source try/except (one bad source never aborts the run); 1st
  failure retry w/ backoff; repeated auth/terms failure disables the source; parser
  mismatch stops *new* publishes from that source but does not mass-expire existing
  listings; honor rate-limit retry headers; never rotate proxies or bypass anti-bot.
- **Tests (pytest, EOB-style, the safety net):** jobs geography inclusion (core cities
  always in, San Jose excluded from default, "SC County"-only → review); ZIP-95006
  validation (95005 "Boulder Creek" rejected); dedup + canonical selection; salary
  normalization; remote CA-eligibility (CA-excluded → rejected); scam-flag routing;
  fair-housing wording flag; and the `MIN_SAFE_TOTAL` guard. Plus JS render smoke tests
  alongside the existing `tools/tests/`.

---

## 9. Pages & navigation

- New Squarespace pages `/jobs` and `/rentals`, each a code block with the tool div +
  the shared `bcl-tools.js` script tag, plus crawlable intro copy outside the widget.
- Jobs tabs: Local · Remote · Employers hiring · Post a job. Rentals tabs: All · Entire
  homes · Apartments & ADUs · Rooms & shared · List a rental.
- Nav: add Jobs and Rentals (placement TBD with owner — likely under a "Tools & Resources"
  grouping alongside the directory).
- Every public record shows its source and a last-verified date; every page carries the
  "BCL is not the employer / not the landlord; verify independently" disclaimer and, for
  rentals, the scam-safety + fair-housing notice.

---

## 10. Build order (for the implementation plan)

1. **Shared foundation** — `shared/bcl_ingest.py` (fetch, sanitize, dedup, geo, JSON I/O,
   guard, versioning), source-registry format, review-board generator, gitignore for
   private files. Acceptance: one test jobs source + one test rentals source run the full
   pipeline; re-running produces no duplicates; a failing source doesn't stop the run.
2. **Compile + verify the source registries** — the top-25 employer list (URLs + ATS
   types), gov/edu portals, remote feeds, property-manager pages. Robots/terms review per
   source (onboarding checklist).
3. **Jobs pipeline** (local + remote) + `bcl-tools.js` `#bcl-jobs` renderer + `/jobs` page
   + tests + scheduled `.bat`.
4. **Rentals pipeline** + `#bcl-rentals` renderer + `/rentals` page + tests + scheduled
   `.bat`.
5. **Submission forms** + review-board wiring + expiry/renewal.
6. **Launch checks** — MIN_SAFE_TOTAL tuned, disclaimers live, first daily runs verified,
   owner walks the review board.

**Deferred (fast-follow, not MVP):** paid aggregators (Adzuna/USAJOBS/Careerjet), live
Google commute routing, email job/rental alerts, partnerships/featured listings, deep
analytics, a second-town (SLV-wide) rentals expansion.

---

## 11. Success criteria (MVP)

- Core cities always included; every public job has a working canonical source; no
  restricted-platform scraping.
- Zero rentals outside 95006 published (zero tolerance).
- Every public record carries a source + last-verified timestamp.
- A broken scrape can never blank or corrupt the live board (guard holds).
- Human review gate honored: nothing from a non-authoritative or flagged source publishes
  without owner approval via the review board.
- Both tools refresh automatically every day with no hosted infrastructure.
