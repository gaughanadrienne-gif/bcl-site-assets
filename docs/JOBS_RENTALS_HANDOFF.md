# Boulder Creek Local — Jobs & Rentals Tools: Handoff

**Status (2026-07-19):** Built and tested on branch `feature/jobs-rentals-tools`. Nothing is live yet. The whole system is static (no server, no database), matching the EOB job-board pattern: local Python scripts pull from authorized sources, write clean JSON into this repo, and the widget renders it. Human review gates every non-authoritative listing.

## What works right now

- **Jobs board:** `python jobs/refresh_jobs.py` produces `data/jobs.json`. Last run: **110 jobs** (County of Santa Cruz, City of Scotts Valley, SLVUSD schools, Second Harvest, plus California-eligible remote from Remotive + We Work Remotely). Local and remote are separate tabs; extended-commute jobs hidden by default; pay/commute/source/verified-date on every card; no pay floor (missing pay shows "Pay not listed").
- **Rentals board:** `python rentals/refresh_rentals.py` produces `data/rentals.json`. Last run: **1 published** (PMI's 12895 Highway 9, 95006, $3,600) + **1 queued** (an undisclosed-address Boulder Creek listing awaiting verification). Strict 95006 only; commercial/vacation/for-sale excluded; scam + fair-housing wording routes to the review queue and never auto-publishes.
- **Rendering:** the existing `tools/bcl-tools.js` widget now renders `#bcl-jobs` and `#bcl-rentals`. Preview screenshots are in `preview/screens/`.
- **Tests:** 134 Python tests + the JS render tests, all green.

## How it runs (daily, unattended)

- `jobs/run_refresh_jobs.bat` and `rentals/run_refresh_rentals.bat` each: run the refresh, and only if it succeeds, `git commit` the JSON, `git push`, and purge jsDelivr. A safety guard refuses to overwrite the live board if a run looks broken, so a failed scrape can never blank the board.
- Schedule (to be registered via Task Scheduler, same mechanism as the EOB job board): jobs daily 6:00am PT; rentals 6:05am + 2:05pm PT.

## Human-review flow (no backend)

- Authoritative sources (official gov/education/employer pages, verified property managers) that pass every filter **auto-publish**.
- Anything ambiguous, submitted, or scam/fair-housing/location-flagged goes to a **private** `review/*-pending.json` and a generated `review/review-board.html` (a tap-to-approve page like the logo board). Approvals become entries in `partials/manual-*.json` via `python scripts/promote_submissions.py <jobs|rentals>`, and the next refresh merges them, still running every one through the same gates.

## The source registry

`jobs/sources.py` and `rentals/sources.py` hold every source with an on/off flag and an "onboarded" (terms-reviewed) flag. Enabled today = the clean, structured, public sources. Many more are encoded but **disabled**, pending either parser work (JS-rendered ATS pages) or your go-ahead. Full detail: `docs/superpowers/research/source-registry-raw.md`.

## What's yours to do (to go live)

1. **Create the Squarespace pages** `/jobs` and `/rentals` — paste-ready embed code is in `docs/embeds/jobs-embed.html` and `docs/embeds/rentals-embed.html` (a div + the widget script). Add a sentence or two of crawlable intro copy outside the widget.
2. **Create the two submission forms** `/post-a-job` and `/list-a-rental` (native Squarespace forms → hello@) using the field specs in `docs/submissions/post-a-job-form.md` and `list-a-rental-form.md`.
3. **Two quick decisions:**
   - **Google (Santa Cruz)** — the old Looker office looks closed/downsized; keep it in the registry (harmless, yields nothing if there are no local roles) or drop it?
   - **Enabling more sources** — the big employers (Joby, HP, hospitals, grocery chains) are registered but need per-ATS parser work; say the word and I'll build the Workday/iCIMS/Dayforce/etc. parsers and switch them on.
4. **Go live:** once the pages exist, merge `feature/jobs-rentals-tools` → `main` (that's when jsDelivr starts serving the JSON) and register the two scheduled tasks.

## Deferred follow-ups (noted, not blocking)

- Employer ATS parsers (Workday POST-JSON, iCIMS, Dayforce, Paycom, Paylocity, ADP, Oracle) to switch on the top-25 employers.
- Detail-page enrichment (pull benefits/hours/pay from each listing's detail page) and the "15+ employer with no pay = parser miss" review flag.
- Remote volume caps (100-listing cap, per-category/per-employer limits).
- Richer filters (salary range, pets, furnished), an "employers hiring" tab, and JobPosting JSON-LD.
- The County JobAps live pull returned fewer than the sample; worth confirming when tuning.
