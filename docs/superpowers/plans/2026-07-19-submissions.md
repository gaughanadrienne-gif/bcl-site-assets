# Submissions + Review Wiring — Implementation Plan (Plan 6 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Let local employers and landlords get listings onto the boards through the site's own forms, with human approval, expiry, and renewal, and no backend. Owner-approved submissions live in `partials/manual-<tool>.json`; the refresh pipelines merge them (still running every submission through the same geography/95006/exclusion/safety gates); expired submissions drop off; and a small `promote_submissions.py` turns review-board approvals into manual-partial entries.

**Architecture:** No new services. A submission is a raw-shaped dict in `partials/manual-jobs.json` / `partials/manual-rentals.json` with a `submitted_at` (and optional `renewed_at`). The pipelines load the non-expired manual entries, normalize + include them exactly like a source (so an owner mistake still can't publish a non-95006 rental or an MLM job), and dedup against scraped listings. `promote_submissions.py` reads a `review/<tool>-pending.json` plus an owner-edited approved-ids file and appends the approved items to the manual partial. The Squarespace forms and the hello@ inbox are the intake; a human validates before anything reaches a partial.

**Tech Stack:** Python 3.9+ stdlib, pytest. Depends on plans 1-4 (`shared/`, `jobs/`, `rentals/`).

## Global Constraints

- Working dir: repo root. Branch `feature/jobs-rentals-tools`. Do not push.
- **Human review before publication (trust rule):** nothing enters a `partials/manual-*.json` without a human step. A submission form delivers to hello@; a person validates and either edits the partial directly or approves it via the review board + `promote_submissions.py`.
- **Gates still apply to submissions:** manual entries are normalized and run through `include_job` / `include_rental` (+ rentals `safety_status`) like any source. An owner-approved rental must still be `is_95006`-confirmed to publish (the owner sets `postal_code:"95006"` when they've verified it; otherwise it queues).
- **Expiry:** job submissions expire 30 days after `submitted_at`/`renewed_at`; rental submissions expire 14 days. Expired entries are skipped by the pipeline (not deleted from the file — a renewal can revive them).
- `partials/manual-*.json` ARE committed (owner-curated, public-derived, PII already validated by the human). `review/*` stays gitignored.
- Deterministic: expiry takes `today` as a parameter. Commit after each task with standard trailers.

## Manual entry shape

`partials/manual-jobs.json` = `{ "entries": [ {raw-job fields..., "submitted_at": "YYYY-MM-DD", "renewed_at": null} ] }`
where raw-job fields = the parser-output keys (title, employer, city, url, salary_text, benefits_text, hours_text, description, work_mode, remote, ...). Same idea for `manual-rentals.json` with raw-rental fields (+ `postal_code` the owner confirms).

---

## Task 1: manual-partial loader with expiry

**Files:** Modify `shared/bcl_ingest.py`; Test `tests/test_manual_partial.py`

**Interfaces — Produces:**
- `load_manual_entries(path, today, ttl_days) -> list` — reads `{entries:[...]}`; returns entries whose effective date (`renewed_at` or `submitted_at`) is within `ttl_days` of `today`; skips expired; missing file → `[]`; a malformed entry (no date) is skipped, never raises.

- [ ] **Step 1: Write failing tests** — write two entries to a tmp file, one dated `today` and one dated 40 days before `today`; assert `load_manual_entries(path, today, 30)` returns only the fresh one; a `renewed_at` within ttl revives an old `submitted_at`; missing file → `[]`.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** in `shared/bcl_ingest.py` (reuse `load_json`, `date.fromisoformat`). **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(submissions): manual-partial loader with expiry`.

---

## Task 2: merge manual submissions into the pipelines

**Files:** Modify `jobs/refresh_jobs.py`, `rentals/refresh_rentals.py`; Create `partials/manual-jobs.json`, `partials/manual-rentals.json` (empty `{"entries": []}`); Test `tests/test_manual_merge.py`

**Interfaces — Changes:**
- `build_jobs(...)` gains a step: after scraping sources, load `load_manual_entries("partials/manual-jobs.json", today, 30)`, tag each with `source="Community submission"`, normalize + `include_job` them (so gates apply), and merge into the published/queued split with the same dedup. Same for `build_rentals(...)` with `manual-rentals.json`, ttl 14, running `include_rental` + `safety_status`.

- [ ] **Step 1: Write failing tests** — `tests/test_manual_merge.py`: a manual job entry in a core city with a valid title publishes; a manual job in an unknown city queues (gate still applies); a manual rental with `postal_code:"95006"` publishes; a manual rental without 95006 confirmation queues (never auto-publishes); an expired manual entry does not appear. Use injected fetchers returning `[]` for scraped sources so the test isolates the manual merge.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** the merge in both `build_*` functions + create the two empty partial files. **Step 4: Run — expect PASS + full suite green.** **Step 5: Commit** `feat(submissions): merge manual submissions through the gates`.

---

## Task 3: promote_submissions approval script

**Files:** Create `scripts/promote_submissions.py`; Test `tests/test_promote_submissions.py`

**Interfaces — Produces:**
- `promote(pending, approved_ids, today) -> list[entry]` — pure function: from a `pending` list (review-queue items, each with an `id` + the raw fields) and an `approved_ids` set, returns manual-entry dicts (raw fields + `submitted_at=today`, `renewed_at=None`) for the approved ids only.
- `main(tool, today)` — reads `review/<tool>-pending.json` and `review/<tool>-approved.txt` (owner pastes approved ids there, one per line, from the review board's "Copy approved" button), calls `promote`, and appends the results to `partials/manual-<tool>.json` (dedup by id), writing via `write_json_atomic`.

- [ ] **Step 1: Write failing tests** — `tests/test_promote_submissions.py`: `promote` returns only approved ids, stamped with `submitted_at=today`; an id not in pending is ignored; re-running with the same approval doesn't duplicate (dedup by id). (Test the pure `promote`; the `main` file I/O is exercised via a tmp-dir integration check.)
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement `scripts/promote_submissions.py`.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(submissions): review-board approval promotion script`.

---

## Task 4: submission form specs + owner workflow doc

**Files:** Create `docs/submissions/post-a-job-form.md`, `docs/submissions/list-a-rental-form.md`, `docs/submissions/WORKFLOW.md`

- [ ] **Step 1:** `post-a-job-form.md` — the Squarespace native-form field list for `/post-a-job` (employer name, employer website, submitter name, authorized email, job title, work location/city, work mode, employment type, description, salary or "not provided", application URL or email, posted date, closing date/until-filled, authorization-to-post checkbox, terms acceptance) with the mapping from each field to a `manual-jobs.json` raw-entry key, and the 30-day expiry note.
- [ ] **Step 2:** `list-a-rental-form.md` — the `/list-a-rental` field list (submitter name, email, relationship to property, authority-to-advertise checkbox, property address, ZIP [must be 95006], rental type, monthly rent, deposit, beds, baths, available date, minimum lease term, description, contact method, fair-housing-compliance checkbox, accuracy checkbox, expiry-agreement) mapped to `manual-rentals.json` keys, with the 14-day expiry + renewal note and a reminder that the owner sets `postal_code:"95006"` only after confirming the property is in 95006.
- [ ] **Step 3:** `WORKFLOW.md` — the end-to-end human loop: form submission arrives at hello@ → owner validates (real employer/landlord, not a scam, fair-housing-clean) → either (a) edit the manual partial directly, or (b) add the item to the review queue and approve via the board + `promote_submissions.py` → next scheduled refresh merges it (gates still apply) → it appears on the board → expiry drops it unless the submitter uses the renewal link. Include the exact commands (`python scripts/promote_submissions.py jobs`, etc.).
- [ ] **Step 4: Commit** `docs(submissions): form specs + owner workflow`.

---

## Self-Review Notes

- **Submissions without a backend (spec 8):** forms → hello@ → human → `partials/manual-*.json` → pipeline merge. Tasks 1-4.
- **Gates still apply (trust rule):** Task 2 runs manual entries through `include_job`/`include_rental`/`safety_status`, so a submission cannot bypass geography/95006/exclusion/fair-housing checks.
- **Expiry + renewal (spec 15.5/23.3):** Task 1 (30-day jobs / 14-day rentals; renewal revives). 
- **Review-board approval loop (spec 4):** Task 3 turns board approvals into manual entries.
- **Human-review-before-publish (trust rule):** enforced by the workflow — nothing reaches a partial without a person.
- **Deferred:** secure contact relay, automated renewal-reminder emails (day 10/13), and "verified owner/manager" badge issuance are additive follow-ups; the owner creates the actual Squarespace forms (owner-only UI) from the Task 4 specs.
