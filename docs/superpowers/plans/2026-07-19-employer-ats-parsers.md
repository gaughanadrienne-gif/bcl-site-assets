# Employer ATS Parsers — Implementation Plan (Plan 3b, jobs follow-up)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add six employer-ATS parser families so the top-25 Santa Cruz County employers (already in the registry) actually produce jobs: Workday (JSON), Oracle Recruiting (JSON REST), Dayforce, Paycom, Paylocity, CalOpps (all HTML via firecrawl). Wire the fetch dispatch, geo-filter every employer's jobs to local worksites, fix two registry errors the fixture capture found, and honestly disable the two ATS families that can't be scraped headless (iCIMS SPA rows, ADP bot-wall).

**Architecture:** Same as plan 3. Pure parser functions turn a source's raw response (parsed JSON or firecrawl markdown) into raw-job dicts; the existing normalize + include_job path handles geography/salary/dedup/guard. New shared helpers: a relative-date parser (Workday says "Posted 5 Days Ago"), an HTTP POST-JSON fetch (Workday), and a firecrawl wait option (Paycom needs render time). All parsers are fixture-tested offline.

**Tech Stack:** Python 3.9+ stdlib (`json`, `re`, `urllib`, `datetime`), pytest. Depends on plans 1-3.

## Global Constraints

- Working dir: repo root. Branch `feature/jobs-rentals-tools`. Do not push.
- Stdlib + pytest only. Fixtures in `tests/fixtures/` are ground truth — READ each before writing its parser and pin assertions to real values.
- **Geo-filter is mandatory:** multi-site employers return national jobs. Every parser must extract each job's work city so `include_job`'s geography gate keeps only core/extended-area roles. Where a listing has no per-job city (single-site employer, e.g. Dream Inn), fall back to the source's `geo:"employer:<City>"` hint. Never publish an out-of-area role.
- **No pay floor** (unchanged): most ATS list views have no salary; that is fine — publish with `salary_disclosed=False`.
- **iCIMS and ADP are DEFERRED:** the iCIMS SPA did not render job rows to markdown and ADP serves a bot-wall. This plan sets the iCIMS sources (Joby, Dominican/CommonSpirit) and the ADP source (Housing Matters) to `enabled=False` with a note, so the registry is honest. Their parser work is a separate follow-up (needs a real browser / JSON-endpoint discovery).
- Commit after each task with the standard trailers.

## Raw job dict (unchanged from plan 3)

Parsers return: `title, employer, location_text, city, url, date_posted, salary_text, benefits_text, hours_text, description, work_mode, remote(False), eligibility_text("")`.

---

## Task 1: shared helpers — relative date, POST-JSON, firecrawl wait

**Files:** Modify `shared/bcl_ingest.py`; Test `tests/test_ats_helpers.py`

**Interfaces — Produces:**
- `parse_relative_date(text, today) -> str` — "Posted 5 Days Ago"/"Posted Today"/"Posted 30+ Days Ago" → an ISO date string `today - N days` (Today→today; "30+"→today-30); unparseable → "". Deterministic (today passed in).
- `http_post_json(url, body, timeout=25, opener=None) -> object` — POST `body` (dict) as JSON with the standard User-Agent + `Content-Type: application/json`, return parsed JSON. Injectable `opener` for tests.
- `firecrawl_markdown(url, runner=None, wait_ms=0)` — extend the existing function with an optional `wait_ms`; when >0 and using the real runner, pass firecrawl's wait flag. The injectable `runner` still bypasses the network.

- [ ] **Step 1: Write failing tests** — `tests/test_ats_helpers.py`:

```python
from shared.bcl_ingest import parse_relative_date, http_post_json, firecrawl_markdown


def test_relative_date():
    assert parse_relative_date("Posted 5 Days Ago", "2026-07-19") == "2026-07-14"
    assert parse_relative_date("Posted Today", "2026-07-19") == "2026-07-19"
    assert parse_relative_date("Posted 30+ Days Ago", "2026-07-19") == "2026-06-19"
    assert parse_relative_date("garbage", "2026-07-19") == ""

def test_post_json_sends_body_and_parses():
    seen = {}
    class R:
        def read(self): return b'{"total": 2}'
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake_opener(req, timeout=None):
        seen["data"] = req.data; seen["ctype"] = req.get_header("Content-type")
        return R()
    out = http_post_json("https://x/jobs", {"limit": 5}, opener=fake_opener)
    assert out == {"total": 2}
    assert b'"limit"' in seen["data"] and seen["ctype"] == "application/json"

def test_firecrawl_wait_passthrough_via_runner():
    assert firecrawl_markdown("https://x", runner=lambda u: "md", wait_ms=5000) == "md"
```

- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** in `shared/bcl_ingest.py` (reuse `USER_AGENT`; `parse_relative_date` via regex `(\d+)` + `date`; `http_post_json` via `Request(url, data=json.dumps(body).encode(), headers={...}, method="POST")`; add `wait_ms` param threaded into `_run_firecrawl` as `--wait-for`). **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): ATS helpers (relative date, post-json, firecrawl wait)`.

---

## Task 2: Workday parser (JSON)

**Files:** Create `jobs/parsers/workday.py`; Test `tests/test_parser_workday.py`

**Interfaces — Produces:** `parse(data, source) -> list[dict]` where `data` is the parsed Workday `/wday/cxs/<tenant>/<site>/jobs` JSON. Recipe (from `tests/fixtures/workday_foxfactory.json`): iterate `data["jobPostings"]`; `title`=`title`; `location_text`=`locationsText`; `city` = first city parsed out of `locationsText` (e.g. `"US CA, Scotts Valley"` → "Scotts Valley"; `"N Locations"` → "" so it falls to review/geo-unknown or detail-fetch later); `url` = `source["config"]["host"] + "/en-US/" + source["config"]["site"] + externalPath`; `date_posted` = `parse_relative_date(postedOn, today)` — pass `today` via `source["_today"]` set by the caller, or default ""; `salary_text`=""; `description`="". `remote=False`, `work_mode="on-site"`.

- [ ] **Step 1: Write failing tests** — read `tests/fixtures/workday_foxfactory.json`; assert parse returns rows for the fixture's postings; a `"US CA, Scotts Valley"` posting yields city "Scotts Valley"; url contains the tenant host + externalPath; a multi-location `"N Locations"` posting yields city "".
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): Workday JSON parser`.

---

## Task 3: Oracle Recruiting parser (JSON REST)

**Files:** Create `jobs/parsers/oracle.py`; Test `tests/test_parser_oracle.py`

**Interfaces — Produces:** `parse(data, source) -> list[dict]` where `data` is the Oracle CE REST JSON. Recipe (from `tests/fixtures/oracle_safeway.json`): `data["items"][0]["requisitionList"]`; each: `title`=`Title`; `city` = first segment of `PrimaryLocation` before the first comma (e.g. `"Los Gatos, CA, United States"` → "Los Gatos"); `location_text`=`PrimaryLocation`; `date_posted`=`PostedDate` (already ISO); `url` = `source["config"]["job_url"].format(id=Id)` when a pattern is configured, else `source["url"]`; `salary_text`=""; `description`=`ShortDescriptionStr` (sanitized). `remote` from `WorkplaceType` containing "Remote". The geo gate then drops non-local `PrimaryLocation` rows.

- [ ] **Step 1: Write failing tests** — read `tests/fixtures/oracle_safeway.json`; assert rows returned; a `"Los Gatos, CA, United States"` row → city "Los Gatos" (core); `PostedDate` passed through as ISO; title populated.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): Oracle Recruiting REST parser`.

---

## Task 4: markdown ATS parsers — Dayforce, Paycom, Paylocity, CalOpps

**Files:** Create `jobs/parsers/dayforce.py`, `paycom.py`, `paylocity.py`, `calopps.py`; Test `tests/test_parser_ats_markdown.py`

Recipes (read each fixture; pin one real row per parser):
- **dayforce** (`dayforce_newleaf.md`): each card `[**{title}**]({url})` then a full address line — `city` = the 3rd comma-segment (e.g. `Santa Cruz`); `date_posted` from `Posted {Weekday}, {Month} {Day}, {Year}` (parse to ISO); full description is inline on the page. Exclude non-local cities (keep only cities the geo table knows; Half Moon Bay drops via the geo gate).
- **paycom** (`paycom_communitybridges.md`, fetch with `wait_ms=5000`): each block `[**{TITLE}** ... {JobType} ... {Location} ...]({url})`; `location` line is `"{Site} - {City}, CA {zip}"` → `city`; strip the "Hot Job" badge; `hours_text` from JobType.
- **paylocity** (`paylocity_dreaminn.md`): `[{title}]({url})` + `"{MM/DD/YYYY} - {Department}"` (→ date_posted) + a facility line. Single-site employer → `city=""` in the parser; the caller fills it from `source` geo (Task 5).
- **calopps** (`calopps_centralfire.md`): markdown table `| {close date} | [{title} ({req#}) {tags}]({url}) | {category} |`; `title` (strip the `(req#)` and tags), `url` from the link, `application_deadline` = close date; `city=""` (agency is county-wide → caller fills from source geo). `category` from the 3rd column.

- [ ] **Step 1: Write failing tests** — `tests/test_parser_ats_markdown.py` loads each fixture, asserts ≥1 row with title+url, and pins: Dayforce a "Santa Cruz"/"Aptos"/"Capitola" city; Paycom a "Watsonville"/local city + "Hot Job" stripped from title; Paylocity title+url with empty city; CalOpps the firefighter row with the deadline parsed.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement the four parsers.** **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): Dayforce + Paycom + Paylocity + CalOpps parsers`.

---

## Task 5: registry fixes + fetch dispatch + geo fallback + wiring + smoke

**Files:** Modify `jobs/sources.py`, `jobs/refresh_jobs.py`, `jobs/normalize.py`; Test `tests/test_ats_integration.py`, plus update `tests/test_jobs_sources.py`

- [ ] **Step 1: Registry fixes in `jobs/sources.py`:**
  - Fix Central Fire URL to `https://www.calopps.org/centralfiresc` (the task URL 404s).
  - Set Oracle sources (Nob Hill/Raley's, Safeway) to `enabled=True, terms_ok=True`, and add `config` with the REST endpoint + `job_url` pattern + `keyword`. Add Fox Factory / METRO Workday `config` with `host`/`tenant`/`site`. Add a `city` to single-site employer configs where geo is `employer:<City>` (Dream Inn → Santa Cruz, Bay Photo → Scotts Valley, etc.).
  - Set the iCIMS sources (Joby, Dominican/CommonSpirit) and the ADP source (Housing Matters) to `enabled=False` with `notes` explaining iCIMS SPA rows / ADP bot-wall need a browser approach (deferred).
  - Update `tests/test_jobs_sources.py` if any asserted-enabled name changed (it should not — the enabled set it checks is County/Scotts Valley/SLVUSD/Second Harvest/Remotive).
- [ ] **Step 2: `jobs/normalize.py` geo fallback:** when `raw["city"]` is empty and `source["geo"]` starts with `"employer:"`, use the city after the colon as the work city (so single-site employers geo-resolve). Add a test.
- [ ] **Step 3: `jobs/refresh_jobs.py`:** add the six parsers to `PARSERS`; extend `fetch_raw` dispatch by platform: `workday` → `http_post_json(cfg endpoint, {"appliedFacets":{},"limit":cfg.get("limit",20),"offset":0,"searchText":""})`; `oracle` → `http_json(cfg REST url)`; `dayforce`/`paylocity`/`calopps` → `firecrawl_markdown(url)`; `paycom` → `firecrawl_markdown(url, wait_ms=5000)`. Pass `today` to parsers that need it (set `source["_today"]=today` before parse, or thread `today` into the parse signature — pick one and keep it consistent). Keep per-source exception isolation.
- [ ] **Step 4: Write `tests/test_ats_integration.py`** — inject fake fetchers returning the ATS fixtures for a subset (Workday + Dayforce + Oracle), run `build_jobs`, assert local employer jobs publish (Scotts Valley Fox Factory role, a Santa Cruz New Leaf role, a local Oracle role), that a non-local role (e.g. a Fox Factory role in another state, or Oracle "Nogales AZ") is NOT published, and that a `paylocity`/single-site source resolves its city from the employer geo hint.
- [ ] **Step 5: Run the full suite** `python -m pytest -q` — green.
- [ ] **Step 6: Live smoke:** `python jobs/refresh_jobs.py`; report the new `data/jobs.json` count (expected to rise well above 110 as the employer sources light up) and the new source breakdown. Do NOT commit data/jobs.json; do NOT push.
- [ ] **Step 7: Commit** `feat(jobs): wire ATS parsers + registry fixes + employer geo fallback`.

---

## Self-Review Notes

- **Six ATS families built** (Workday, Oracle, Dayforce, Paycom, Paylocity, CalOpps) against real fixtures — Tasks 2-4.
- **Geo-filter mandatory:** per-job city extraction + `include_job` geo gate + employer-city fallback for single-site sources — Tasks 2-5.
- **Registry honesty:** CalOpps URL fixed; Oracle enabled; iCIMS + ADP disabled with a documented reason (deferred, need a browser) — Task 5.
- **Helpers:** relative-date (Workday), POST-JSON (Workday), firecrawl wait (Paycom) — Task 1.
- **Deferred (documented):** iCIMS (Joby, CommonSpirit) + ADP (Housing Matters) real parsers; Workday/Oracle detail-page description + salary enrichment; Paylocity/Paycom pagination for large tenants; the general detail-enrichment step (still a separate follow-up).
- **Placeholder note:** parser exact assertions are pinned by the implementer from the on-disk fixtures, consistent with plan 3.
