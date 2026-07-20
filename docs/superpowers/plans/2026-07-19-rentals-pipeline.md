# Rentals Pipeline + Parsers — Implementation Plan (Plan 4 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Build the rentals refresh pipeline: parsers (against REAL fixtures) for the confirmed-95006 property managers, normalization to the public rentals schema, strict 95006 inclusion with an undisclosed-address review path, exclusions (commercial/vacation/for-sale/placeholder), scam-indicator and fair-housing routing to the review queue, dedup, and `refresh_rentals.py` with a tiny-inventory-safe guard that writes `data/rentals.json`.

**Architecture:** Mirrors the jobs pipeline (plan 3). Pure parser functions turn a source's firecrawl markdown into raw rental dicts; normalize maps to the public schema using plan-1 helpers (`is_95006`, `make_slug`, `sanitize_text`); inclusion + safety gates split publish vs queue; a rentals-specific guard protects the small 95006 board from being blanked by a broken scrape. All parsers fixture-testable offline; only `refresh_rentals.py`'s fetch layer hits the network.

**Tech Stack:** Python 3.9+ stdlib, pytest. Depends on plans 1 (`shared/`) and 2 (`rentals/sources.py`).

## Global Constraints

- Working dir: repo root. Branch `feature/jobs-rentals-tools`. Do not push.
- Stdlib + pytest only.
- **Strict 95006 (spec 6.1):** publish only when ZIP 95006 is confirmed (`is_95006`). A verified-PM listing whose address is intentionally undisclosed but is in Boulder Creek routes to the REVIEW QUEUE (never auto-published, never rejected). Any other ZIP → reject.
- **Exclusions (spec 6.2):** reject commercial-only, vacation/short-term, for-sale, `$0`/no-bed placeholder cards, and anything with a known minimum stay under 30 days.
- **Safety (spec 6.3):** scam-indicator hits and potential fair-housing violations route to the queue with a reason. NEVER auto-publish a scam/fair-housing-flagged listing; NEVER reword discriminatory text. Never collect or store personal contact info (names/phones/emails) — only property fields.
- **Tiny-inventory guard:** 95006 rental inventory is ~1-5 listings; a count floor is wrong. The rentals guard refuses to overwrite `data/rentals.json` only when a run both (a) shrinks the published set below the prior file AND (b) had at least one source fetch error. A clean run that genuinely finds 0 listings is allowed to publish an empty board.
- Fixtures are ground truth: `tests/fixtures/rentvine_pmi.md`, `tests/fixtures/streamline_rentals.md`, `tests/fixtures/appfolio_populated.md`, `tests/fixtures/appfolio_scottsvalley.md` (empty state). Read them before writing each parser.
- Commit after each task with the standard Co-Authored-By / Claude-Session trailers.

## Raw rental dict (parser output) → public schema

Parsers return dicts with: `headline, address_public, city, postal_code, monthly_rent, bedrooms, bathrooms, square_feet, available_date, property_type, url, description, undisclosed (bool)`.

`normalize_rental(raw, source, today)` returns the spec §7 rentals schema:
`id, slug, headline, property_type, rental_scope, address_public, city, state, postal_code, location_precision, monthly_rent, total_monthly_price, deposit, application_fee, bedrooms, bathrooms, square_feet, available_date, lease_term, minimum_stay_days, furnished, pets_policy, utilities_text, parking_text, laundry_text, description_summary, canonical_url, source, property_manager, first_seen_at, last_verified_at, verification_status, freshness_label`.

---

## Task 1: rentals parsers (RentVine, AppFolio, Streamline custom)

**Files:** Create `rentals/parsers/__init__.py`, `rentals/parsers/rentvine.py`, `rentals/parsers/appfolio.py`, `rentals/parsers/custom_html.py`; Test `tests/test_rentals_parsers.py`

**Interfaces — Produces:** each module's `parse(markdown, source) -> list[dict]` (raw rental dicts). Recipes from the captured fixtures (read each fixture and pin one concrete assertion):
- **rentvine.py** (`rentvine_pmi.md`): each card is a markdown image-link block. Extract from the plain-text lines within each block: `$X,XXX/mo.` → monthly_rent; `Beds: N`; `Baths: N` (or `Full Baths` + `Half Baths` → sum, half=0.5); `sqft: N`; the `{street}, {city}, {zip}` line → address_public/city/postal_code; property type line; `Available: {Immediately|MM-DD-YYYY}`; the block's trailing `](url)` → url. `undisclosed=False` (RentVine shows full addresses).
- **appfolio.py** (`appfolio_populated.md`): each card has `RENT $X,XXX`, `N bd / N ba`, optional `Square Feet N`, `Available {NOW|M/D/YY}`, an address line `{street}, {city}, CA {zip}`, and a `/listings/detail/{uuid}` url. SKIP any card with rent `$0` or missing bed/bath (the "Online Rental Application" placeholder). `undisclosed=False`.
- **custom_html.py** (`streamline_rentals.md`): each listing is an `## {H2 address}` block followed by `**Price:** $X,XXX/mo` (MAY BE ABSENT), `**Beds:** N`, `**Baths:** N`, `**Area:**|**Size:** N sqft` (units inconsistent — strip non-digits), `**Address:** {full}` (present even when H2 is undisclosed), `**Type:** {type}` (may be "Commercial"), `**Availability:** {...}`. Treat EVERY field as optional. `undisclosed=True` when the H2 contains "Undisclosed" (fall back to city from the H2/Address). No detail url exists → url = source["url"].

- [ ] **Step 1: Write failing tests** — `tests/test_rentals_parsers.py` loads each fixture, runs the parser, and asserts: ≥1 row; each row has headline + city; RentVine parses the confirmed "12895 Highway 9 / 95006 / $3,600 / 2bd" row (pin these exact values); Streamline yields both a disclosed 95006 row (13350 Big Basin Way) and an `undisclosed=True` row; AppFolio skips the `$0` placeholder card (assert no row has monthly_rent 0/empty with no beds). Read the fixtures to pin concrete values.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the three parsers against the fixtures.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(rentals): RentVine + AppFolio + Streamline parsers`.

---

## Task 2: normalize + 95006 inclusion + exclusions

**Files:** Create `rentals/normalize.py`; Test `tests/test_rentals_normalize.py`

**Interfaces — Produces:**
- `normalize_rental(raw, source, today) -> dict` — maps raw → public schema. `rental_scope` = "private-room"/"shared" if headline/type mention room/shared, else "entire". `property_type` normalized. `location_precision` = "exact" if address+ZIP, "zip-only"/"approximate" if undisclosed. `monthly_rent` numeric (strip `$`,`,`). `minimum_stay_days` from lease terms if present. `state`="CA". `verification_status`="verified". `property_manager` = source["name"].
- `RENTAL_EXCLUDE` (list) and `include_rental(rental) -> (status, reason)` where status ∈ {"publish","queue","reject"}:
  - reject if property_type is commercial, vacation/short-term, for-sale, or a `$0`/no-bed placeholder, or `minimum_stay_days` known and < 30.
  - if `is_95006(rental)` (ZIP confirmed) → "publish".
  - elif city matches Boulder Creek (case-insensitive) and undisclosed/zip missing → "queue", reason "undisclosed-95006-verify".
  - else → "reject" (other ZIP / not Boulder Creek).

- [ ] **Step 1: Write failing tests:** a confirmed 95006 SFR → include ("publish"); a commercial listing → ("reject"); an undisclosed Boulder Creek listing → ("queue","undisclosed-95006-verify"); a Ben Lomond 95005 listing → ("reject"); a normalized rent "$3,600/mo." → monthly_rent 3600; a room listing → rental_scope "private-room". (Concrete assertions.)
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement `rentals/normalize.py`.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(rentals): normalize + 95006 inclusion + exclusions`.

---

## Task 3: scam-indicator + fair-housing gates

**Files:** Create `rentals/safety.py`; Test `tests/test_rentals_safety.py`

**Interfaces — Produces:**
- `scam_flags(rental) -> list[str]` — returns matched scam indicators from a keyword scan of description + headline: wire transfer, gift card, cryptocurrency/bitcoin, "money order", "western union", "before viewing"/"without seeing", "overseas"/"out of the country", "moving company will", "keys will be mailed", and an implausibly-low rent (monthly_rent > 0 and < 600). Empty list = clean.
- `fair_housing_flags(rental) -> list[str]` — returns matched potential fair-housing violations from wording: "no children"/"no kids", "adults only" (context-flag), "christian"/"muslim"/"no [race]" preference patterns, "no disabled", "must be employed by", "english speaking only", "no section 8" (source-of-income, protected in CA). Empty = clean.
- `safety_status(rental) -> (ok: bool, reasons: list[str])` — ok False if either list is non-empty; reasons combine both prefixed ("scam:" / "fairhousing:").

These gates route to the queue in Task 4; they NEVER auto-publish a flagged listing and NEVER modify the wording.

- [ ] **Step 1: Write failing tests:** a "wire the deposit before viewing" description → scam_flags non-empty; a "$450/mo" rent → scam (low-rent); "no children please" → fair_housing_flags non-empty; "no section 8" → fair_housing flag (CA source-of-income); a clean listing → both empty, safety_status ok True. (Concrete assertions.)
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement `rentals/safety.py`.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(rentals): scam + fair-housing safety gates`.

---

## Task 4: refresh_rentals orchestration + tiny-inventory guard

**Files:** Create `rentals/refresh_rentals.py`, `rentals/run_refresh_rentals.bat`; Modify `shared/bcl_ingest.py` (add `write_rentals_guarded`); Test `tests/test_refresh_rentals.py`, `tests/test_rentals_guard.py`

**Interfaces — Produces:**
- `write_rentals_guarded(path, records, note, today, had_errors) -> dict` in `shared/bcl_ingest.py`: loads the prior file's count; if `had_errors and len(records) < prior_count` → raise `GuardError` (keep old); else write `{_note, updated, count, rentals: records}`. A clean run may publish 0.
- `PARSERS` map (rentvine/appfolio/custom_html/rentvine→callables); `fetch_raw(source, fetchers)` (all rentals sources use firecrawl markdown).
- `build_rentals(sources, fetchers, today) -> (published, queued, had_errors)`: for each ENABLED rentals source: fetch, parse by `source["parser"]`, normalize, run `include_rental`; for "publish" candidates also run `safety_status` — if not ok, downgrade to queue with the safety reasons. Dedup published by `record_fingerprint([address_public, city])` and by normalized url. A per-source exception is caught, sets `had_errors=True`, never aborts.
- `main()`: `build_rentals` with real firecrawl fetcher + Pacific `today`; write `data/rentals.json` via `write_rentals_guarded(..., had_errors)`; write `review/rentals-pending.json`; regenerate `review/review-board.html` (rentals items).

- [ ] **Step 1: Write failing tests:**
  - `tests/test_rentals_guard.py`: prior file count=3; a run with `had_errors=True` and 1 record → `GuardError`, file untouched; a run with `had_errors=False` and 0 records → writes count 0; a run with `had_errors=True` and 4 records (grew) → writes.
  - `tests/test_refresh_rentals.py`: fake fetchers returning the RentVine + Streamline fixtures; `build_rentals` over those two sources → `published` contains the 95006 rows, `queued` contains the undisclosed Boulder Creek row; a commercial row is absent from both (rejected); one fetcher raising sets `had_errors=True` but the other still yields; re-run is idempotent (deduped).
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** `write_rentals_guarded`, `rentals/refresh_rentals.py`, and `rentals/run_refresh_rentals.bat` (EOB-style wrapper; morning + afternoon schedule per spec; never runs push in tests).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Live smoke (network):** `python rentals/refresh_rentals.py`; report `data/rentals.json` count + how many queued. Do not commit data/rentals.json or review/ artifacts; do not push.
- [ ] **Step 6: Commit** `feat(rentals): refresh_rentals orchestration + tiny-inventory guard + .bat`.

---

## Self-Review Notes

- **Parsers (spec 6.2):** Task 1 — RentVine/AppFolio/Streamline against real fixtures, incl. undisclosed-address and $0-placeholder handling.
- **Strict 95006 + review path (spec 6.1):** Task 2 — ZIP-confirmed publish; undisclosed Boulder Creek → queue; other ZIP → reject.
- **Exclusions (spec 6.2):** Task 2 — commercial/vacation/for-sale/placeholder/min-stay.
- **Safety (spec 6.3):** Task 3 — scam + fair-housing → queue, never auto-publish, never reword; Task 4 downgrades flagged publish-candidates to queue.
- **Tiny-inventory guard (spec trust rule + limited 95006 inventory):** Task 4 `write_rentals_guarded` — error-aware, allows a genuinely-empty clean run, protects against a broken scrape shrinking the board.
- **Deferred to follow-ups:** owner/community submission ingestion + renewal (plan 6), the AppFolio JS-render/JSON-endpoint hardening for accounts with more inventory, rentals rendering (plan 5), price/availability-change freshness labels + twice-daily reverify scheduling (registration is an owner/controller step).
- **Placeholder note:** Task 1-2 parser/normalize exact assertions are pinned by the implementer from the on-disk fixtures (ground truth), consistent with plan 3.
