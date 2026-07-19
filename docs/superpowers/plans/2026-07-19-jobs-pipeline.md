# Jobs Pipeline + Parsers — Implementation Plan (Plan 3 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the jobs refresh pipeline: parsers (against REAL captured fixtures) for the enabled sources, normalization to the public schema, geography + quality inclusion rules, remote California-eligibility, dedup, the publish/queue split, and `refresh_jobs.py` that writes `data/jobs.json` (guarded) plus the review queue. Result: `python jobs/refresh_jobs.py` produces a real, populated jobs board.

**Architecture:** Pure parser functions take a source's raw response (markdown string, RSS/XML string, or parsed JSON) and return a list of "raw job" dicts. A normalize step maps raw jobs to the public schema using plan-1 helpers (`classify_geo`, `commute_minutes`, `make_slug`, `sanitize_text`, salary parsing). Inclusion filters drop out-of-area / excluded / CA-ineligible-remote jobs. Dedup + publish/queue + guarded write finish. All parsers are fixture-testable offline; only `refresh_jobs.py`'s fetch layer touches the network (via plan-1's injectable `firecrawl_markdown` / `http_get` / `http_json`).

**Tech Stack:** Python 3.9+ stdlib (`xml.etree.ElementTree` for RSS, `re`, `json`), pytest. Depends on plans 1 (`shared/`) and 2 (`jobs/sources.py`), both on this branch.

## Global Constraints

- Working dir: repo root. Branch `feature/jobs-rentals-tools`. Do not push.
- Stdlib + pytest only. RSS parsing uses `xml.etree.ElementTree` (stdlib), not a third-party lib.
- **BCL jobs rules (from the spec):** NO pay floor and NEVER drop a job for missing pay (label "Pay not listed"); surface pay/benefits/hours when present; exclude MLM/pay-to-start/mystery-shopping/reshipping/"work from phone"/undisclosed-commission-only; local core cities always included; remote jobs only when California-eligible (US-remote or Worldwide OK; drop CA-excluded).
- **Fixtures are ground truth:** parser tests load the real files in `tests/fixtures/` (already captured) and assert on actual values present in them. Read the fixture before writing each parser.
- **Guard:** `refresh_jobs.py` writes via `write_public_json_guarded` with `MIN_SAFE_TOTAL` so a broken run never blanks `data/jobs.json`.
- Commit after each task; end commit body with the Co-Authored-By + Claude-Session trailers used throughout this branch.

## Raw job dict (parser output) → public schema (normalize output)

Parsers return dicts with these keys (missing → None/""):
`title, employer, location_text, city, url, date_posted, salary_text, benefits_text, hours_text, description, work_mode, remote (bool), eligibility_text (remote only)`

`normalize_job(raw, source)` returns the public schema from spec §7:
`id, slug, title, title_original, employer_name, description_summary, employment_type, work_mode, remote_regions, city, state, postal_code, location_precision, geography_tier, commute_minutes, commute_type, salary_min, salary_max, salary_period, salary_text, salary_disclosed, benefits_text, hours_text, schedule, category, posted_at, application_deadline, canonical_url, source, first_seen_at, last_verified_at, verification_status, freshness_label`

---

## Task 1: salary + date parsing helpers

**Files:** Modify `shared/bcl_ingest.py`; Test `tests/test_salary_parse.py`

**Interfaces — Produces:**
- `parse_salary(text) -> dict` → `{min, max, period, disclosed}` where period ∈ {"hour","month","year",None}. Handles "$9,396 - 11,431 / Month", "$101,976.00 - $136,644.00 Annually", "$19.94 Per Hour", "$36k", "$90 - $150 /hour", "" → disclosed False. Never raises.
- `freshness_label(posted_iso, today_iso) -> str` → "New"(≤3d) / "Recent"(≤7d) / "" using date strings (YYYY-MM-DD). Deterministic (today passed in).

- [ ] **Step 1: Write failing tests** — `tests/test_salary_parse.py`:

```python
from shared.bcl_ingest import parse_salary, freshness_label


def test_monthly_range():
    r = parse_salary("$9,396 - 11,431 / Month")
    assert r["min"] == 9396 and r["max"] == 11431 and r["period"] == "month" and r["disclosed"] is True

def test_annual_range():
    r = parse_salary("$101,976.00 - $136,644.00 Annually")
    assert r["min"] == 101976 and r["max"] == 136644 and r["period"] == "year"

def test_hourly_single():
    r = parse_salary("$19.94 Per Hour")
    assert r["min"] == 19.94 and r["max"] == 19.94 and r["period"] == "hour"

def test_k_suffix():
    r = parse_salary("$36k")
    assert r["min"] == 36000 and r["period"] == "year"

def test_empty_not_disclosed():
    r = parse_salary("")
    assert r["disclosed"] is False and r["min"] is None

def test_freshness():
    assert freshness_label("2026-07-18", "2026-07-19") == "New"
    assert freshness_label("2026-07-10", "2026-07-19") == "Recent"
    assert freshness_label("2026-06-01", "2026-07-19") == ""
```

- [ ] **Step 2: Run — expect FAIL** (`ImportError`). `python -m pytest tests/test_salary_parse.py -v`

- [ ] **Step 3: Implement** in `shared/bcl_ingest.py`:

```python
from datetime import date

_MONEY_RE = re.compile(r"\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?", re.I)


def _to_number(num, k):
    val = float(num.replace(",", ""))
    if k:
        val *= 1000
    return int(val) if val == int(val) else val


def parse_salary(text):
    """Parse a free-text pay string into {min, max, period, disclosed}. Never raises."""
    out = {"min": None, "max": None, "period": None, "disclosed": False}
    if not text:
        return out
    low = text.lower()
    nums = _MONEY_RE.findall(text)
    vals = [_to_number(n, k) for n, k in nums if n.strip(",.")]
    if not vals:
        return out
    if "hour" in low or "/hr" in low or "hr" == low.strip():
        out["period"] = "hour"
    elif "month" in low or "/mo" in low:
        out["period"] = "month"
    elif "year" in low or "annual" in low or "/yr" in low or any(v >= 1000 for v in vals):
        out["period"] = "year"
    out["min"] = min(vals)
    out["max"] = max(vals)
    out["disclosed"] = True
    return out


def freshness_label(posted_iso, today_iso):
    """New (<=3d), Recent (<=7d), else '' — from YYYY-MM-DD strings."""
    if not posted_iso:
        return ""
    try:
        p = date.fromisoformat(posted_iso[:10])
        t = date.fromisoformat(today_iso[:10])
    except ValueError:
        return ""
    days = (t - p).days
    if days < 0:
        return ""
    if days <= 3:
        return "New"
    if days <= 7:
        return "Recent"
    return ""
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): salary + freshness parsing helpers`.

---

## Task 2: remote JSON parser (Remotive) + CA-eligibility

**Files:** Create `jobs/parsers/__init__.py`, `jobs/parsers/remote_json.py`; Modify `shared/bcl_ingest.py` (add `is_ca_eligible`); Test `tests/test_parser_remote.py`

**Interfaces — Produces:**
- `is_ca_eligible(location_text) -> bool` — True for "USA", "US only", "North America", "Americas", "Anywhere", "Worldwide", or text naming California; False when a non-US country/region is named without US, or text explicitly excludes US. Empty → False (unknown = not eligible).
- `jobs.parsers.remote_json.parse(data, source) -> list[dict]` — `data` is the parsed JSON (dict with `jobs` list). Returns raw job dicts for CA-eligible roles only, `remote=True`, `work_mode="remote"`.

- [ ] **Step 1: Write failing tests** — load `tests/fixtures/remotive_sample.json`:

```python
import json
from shared.bcl_ingest import is_ca_eligible
from jobs.parsers import remote_json
from jobs.sources import JOB_SOURCES

REMOTIVE = next(s for s in JOB_SOURCES if s["name"] == "Remotive (remote)")


def test_ca_eligible():
    assert is_ca_eligible("USA") is True
    assert is_ca_eligible("Anywhere") is True
    assert is_ca_eligible("California") is True
    assert is_ca_eligible("Europe only") is False
    assert is_ca_eligible("") is False


def test_remotive_parse_returns_records():
    data = json.load(open("tests/fixtures/remotive_sample.json", encoding="utf-8"))
    rows = remote_json.parse(data, REMOTIVE)
    assert isinstance(rows, list)
    for r in rows:
        assert r["remote"] is True and r["work_mode"] == "remote"
        assert r["title"] and r["url"] and r["employer"]
        assert is_ca_eligible(r["eligibility_text"])  # only eligible kept
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** `is_ca_eligible` in `shared/bcl_ingest.py`:

```python
_CA_OK = ("usa", "u.s", "united states", "us only", "us-only", "north america",
          "americas", "anywhere", "worldwide", "california", "remote")
_NON_US_ONLY = ("europe only", "emea only", "uk only", "canada only", "apac", "india only")


def is_ca_eligible(location_text):
    """True if a remote role's location text admits a California/US applicant."""
    if not location_text:
        return False
    low = location_text.lower()
    if any(x in low for x in _NON_US_ONLY):
        return False
    return any(x in low for x in _CA_OK)
```

`jobs/parsers/__init__.py`:
```python
"""Jobs source parsers (one module per platform family)."""
```

`jobs/parsers/remote_json.py`:
```python
"""Parser for JSON remote-job APIs (Remotive schema)."""

from shared.bcl_ingest import is_ca_eligible, sanitize_text


def parse(data, source):
    rows = []
    for job in (data or {}).get("jobs", []):
        loc = job.get("candidate_required_location", "") or ""
        if not is_ca_eligible(loc):
            continue
        rows.append({
            "title": sanitize_text(job.get("title")),
            "employer": sanitize_text(job.get("company_name")),
            "location_text": loc, "city": "", "url": job.get("url", ""),
            "date_posted": (job.get("publication_date") or "")[:10],
            "salary_text": sanitize_text(job.get("salary")),
            "benefits_text": "", "hours_text": sanitize_text(job.get("job_type")),
            "description": sanitize_text(job.get("description")),
            "work_mode": "remote", "remote": True, "eligibility_text": loc,
        })
    return rows
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): remote JSON parser + CA-eligibility`.

---

## Task 3: RSS parser (We Work Remotely + Second Harvest)

**Files:** Create `jobs/parsers/rss.py`; Test `tests/test_parser_rss.py`

**Interfaces — Produces:** `jobs.parsers.rss.parse(xml_text, source) -> list[dict]`. Behavior varies by `source["config"].get("style")`: `"wwr"` (title = "Company: Title"; region → eligibility; remote=True; drop CA-ineligible) vs default/`"employer"` (Second Harvest: title = "Title  (State, City)"; single employer from channel; salary mined from description; remote=False).

- [ ] **Step 1: Write failing tests** — load both RSS fixtures. Read the fixtures first to assert on real values (a known title/employer present in each):

```python
from jobs.parsers import rss
from jobs.sources import JOB_SOURCES

WWR = next(s for s in JOB_SOURCES if s["name"] == "We Work Remotely (remote)")
SH = next(s for s in JOB_SOURCES if s["name"] == "Second Harvest (RSS)")


def test_wwr_splits_company_and_title():
    xml = open("tests/fixtures/wwr_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, {**WWR, "config": {"style": "wwr"}})
    assert rows and all(r["remote"] is True for r in rows)
    assert all(r["title"] and r["employer"] and r["url"] for r in rows)

def test_secondharvest_extracts_location_and_employer():
    xml = open("tests/fixtures/secondharvest_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, {**SH, "config": {"style": "employer", "employer": "Second Harvest Food Bank Santa Cruz County"}})
    assert rows
    for r in rows:
        assert r["employer"] == "Second Harvest Food Bank Santa Cruz County"
        assert r["remote"] is False
        assert r["title"] and r["url"]
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `jobs/parsers/rss.py` using `xml.etree.ElementTree`. Handle namespaces for `region`/`country`/`state` (WWR uses a namespace; fall back to tag localname). Recipe: parse channel → items; for `wwr` split title on first ": "; eligibility from region/country/state; drop non-CA-eligible via `is_ca_eligible`. For `employer` style: title = text before "  (" ; parse "(State, City)"; employer from config; salary from a regex over the description (e.g. `Salary\s*\$[\d,]+(?:-\$?[\d,]+)?`). Use `sanitize_text` on description. (Full implementation: the implementer writes it against the fixtures; keep it stdlib ElementTree, strip namespaces with a localname helper.)

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): RSS parser (WWR + Second Harvest)`.

---

## Task 4: markdown parsers — NEOGOV, JobAps, EDJOIN

**Files:** Create `jobs/parsers/neogov.py`, `jobs/parsers/jobaps.py`, `jobs/parsers/edjoin.py`; Test `tests/test_parser_markdown.py`

**Interfaces — Produces:** each module's `parse(markdown, source) -> list[dict]` (remote=False, work_mode="on-site"). Extraction recipes (from the captured fixtures — the implementer reads each fixture and asserts on a real row):
- **neogov:** parse the markdown table with header `| Job Title | Job Type | Salary | Closing | Posted | Category | Department | Location | Job Number |`. title+url from col 1 link; employer = Department (col 7); salary_text = col 3; date_posted = col 5 (MM/DD/YY → ISO); application_deadline = col 4; city/postal from col 8 ("CA 95066, CA" → postal 95066); hours_text = col 2.
- **jobaps:** repeating blocks; title+url = first link (`bulpreview.asp`); employer = text after "Agency" up to "Salary"; salary_text = text after "Salary" up to "Additional Requirements"; deadline = after "Filing Deadline"; city = "" (County-wide → city "Santa Cruz", tier core).
- **edjoin:** repeating blocks; title+url = bold link (`/Home/JobPosting/<id>`); the "District - City, County, State" line → employer = district, city = the city; deadline = value after "Deadline:"; salary_text = the "$X Per Hour|Stipend|..." line.

- [ ] **Step 1: Write failing tests** — `tests/test_parser_markdown.py` loads each fixture and asserts the parser returns ≥1 row with title+url populated, salary_text present where the fixture shows one, and city/postal parsed for NEOGOV (assert a real ZIP like "95066" appears on some row). Read each fixture to pin one concrete expected value per parser.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the three parsers against the fixtures (markdown/line parsing with `re`).
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): NEOGOV + JobAps + EDJOIN markdown parsers`.

---

## Task 5: normalize + inclusion filters

**Files:** Create `jobs/normalize.py`; Test `tests/test_jobs_normalize.py`

**Interfaces — Produces:**
- `normalize_job(raw, source, today) -> dict` — maps a raw job to the public schema. Uses `parse_salary`, `classify_geo`/`commute_minutes` (on `raw["city"]` or source geo hint), `make_slug`, `freshness_label`. `geography_tier` = "remote" if raw remote else `classify_geo(city)`; `salary_disclosed` from parse_salary; `salary_min/max/period` from it; `state`="CA"; `verification_status`="verified"; `first_seen_at`/`last_verified_at`=today.
- `include_job(job) -> (bool, reason)` — False for: excluded keywords in title/description (MLM, "pay to start", "mystery shop", "reshipping", "work from your phone", "commission only" without base), geography_tier=="unknown" (→ queue, reason "ambiguous-location"), or an empty title/url. Returns reason for queue routing.
- `EXCLUDE_KEYWORDS` list.

- [ ] **Step 1: Write failing tests** covering: a core-city job normalizes with tier "core" and commute minutes; a remote job → tier "remote"; a "$19.94 Per Hour" salary → min/max 19.94, period hour, disclosed True; a missing salary → salary_disclosed False and salary_text ""; an MLM title → include_job False; an unknown-city job → include False reason "ambiguous-location". (Write concrete assertions.)
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `jobs/normalize.py`.
- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(jobs): normalize + inclusion filters`.

---

## Task 6: refresh_jobs orchestration + guarded write

**Files:** Create `jobs/refresh_jobs.py`; Create `jobs/run_refresh_jobs.bat`; Test `tests/test_refresh_jobs.py`

**Interfaces — Produces:**
- `PARSERS` dict mapping parser-tag → callable `(raw, source)`.
- `fetch_raw(source, http_get, http_json, firecrawl_markdown) -> raw` — dispatch by platform: `remote_json`→`http_json(url)`; `rss`→`http_get(url)`; markdown families→`firecrawl_markdown(url)`. (Fetchers injected for testing.)
- `build_jobs(sources, fetchers, today) -> (published, queued)` — for each ENABLED source: fetch, parse (by `source["parser"]`), normalize each, split via `include_job`; dedup published by `record_fingerprint([title, employer, city])` and by normalized url; return the two lists. A per-source exception is caught and logged, never aborts the run.
- `main()` — calls `build_jobs` with real fetchers + today (Pacific date), writes `data/jobs.json` via `write_public_json_guarded(..., key="jobs", min_total=MIN_SAFE_TOTAL)`, writes `review/jobs-pending.json`, and regenerates `review/review-board.html`. `MIN_SAFE_TOTAL = 5`.

- [ ] **Step 1: Write failing test** — `tests/test_refresh_jobs.py`: build fake fetchers that return the saved fixtures (read Remotive JSON + Second Harvest RSS from `tests/fixtures/`), run `build_jobs` over a 2-source subset with those fetchers and a fixed `today`, assert `published` is non-empty, every published job has the required public-schema keys, remote jobs are all CA-eligible, and re-running yields identical count (idempotent/deduped). Assert a per-source exception (one fetcher raises) does not abort and the other source still yields jobs.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `jobs/refresh_jobs.py`. Then `jobs/run_refresh_jobs.bat` mirroring the EOB wrapper: set PATH (Python314, Git, npm/firecrawl, System32), `python jobs\refresh_jobs.py >> jobs\refresh.log 2>&1`, on errorlevel 1 stop (no push), else `git add data/jobs.json && git commit -m "Daily jobs refresh" && git push && curl purge`. (Do NOT run push in tests.)
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Integration smoke (network, manual):** `python jobs/refresh_jobs.py` then confirm `data/jobs.json` exists with `count >= 5`. If a live source is flaky, the guard leaves any prior file intact. Record the result in the report; do not commit `data/jobs.json` from the test run unless it looks correct.
- [ ] **Step 6: Commit** `feat(jobs): refresh_jobs orchestration + guarded write + .bat` (do not commit data/jobs.json or review/ artifacts).

---

## Self-Review Notes

- **Parsers (spec 5.2):** Tasks 2-4 cover remote JSON, RSS (2 styles), and the three markdown gov/edu families — all against real fixtures.
- **No pay floor / surface detail (spec 5.4):** Task 1 + Task 5 — salary parsed but never required; `benefits_text`/`hours_text` carried; missing pay → disclosed False, job kept.
- **Geography (spec 5.1):** Task 5 uses `classify_geo`/`commute_minutes`; unknown city → queue.
- **Remote CA-eligibility (spec 5.3):** Task 2 `is_ca_eligible`, applied in remote parsers.
- **Guard/trust (spec 3):** Task 6 `write_public_json_guarded`, MIN_SAFE_TOTAL=5, per-source exceptions isolated.
- **Review split (spec 4):** Task 5 `include_job` reasons route to `review/jobs-pending.json` + review board (Task 6).
- **Deferred to a follow-up plan:** JS-render/bot-blocked sources (Kaiser/Sutter/HP/PayStand/Google/Santa Cruz Works — all `enabled=False` in the registry), Workday POST-JSON + iCIMS/Dayforce/Paycom/Paylocity/ADP/Oracle employer parsers (registry-ready, parsers added incrementally), scheduling registration (owner/controller runs `schtasks`), rentals (plan 4), rendering (plan 5).
- **Placeholder note:** Tasks 3-5 direct the implementer to read the on-disk fixtures and pin concrete assertions from them — the fixtures are the ground-truth spec for parser behavior, so exact expected values are read from real data rather than guessed here.
