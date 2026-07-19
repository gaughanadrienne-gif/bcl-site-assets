# Jobs & Rentals Shared Ingest Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, fully-tested Python library that both the Jobs and Rentals refresh pipelines depend on — fetching, sanitizing, deduping, location/ZIP validation, commute lookup, a detail-fetch cache, a safety guard that can never blank the live board, and a browser review-board generator.

**Architecture:** A single stdlib-first package `shared/` in the existing `bcl-site-assets` repo, imported by the later `refresh_jobs.py` / `refresh_rentals.py` scripts. Network I/O is wrapped behind injectable functions so every unit is testable offline. The pipeline writes clean public JSON to `data/`, and never overwrites it when a run looks broken.

**Tech Stack:** Python 3.9+ (machine has Python 3.14), standard library only for the core (`urllib`, `json`, `hashlib`, `re`, `subprocess`, `html`, `datetime`), the external `firecrawl` CLI for markdown scraping (already on PATH from the EOB setup), and `pytest` for tests. No third-party Python packages.

## Global Constraints

- **Repo:** `bcl-site-assets` (public; GitHub Pages + jsDelivr). Working dir for all commands is the repo root: `C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets`.
- **Stdlib-first:** core library uses only the Python standard library + the `firecrawl` CLI. No `requests`, no pip packages except `pytest` (dev-only).
- **Public vs private:** `data/*.json` is public and clean (no internal fields). `review/*.json`, `review/*.html`, and `partials/detail_cache.json` are PRIVATE and gitignored — never committed.
- **Trust rule:** missing data is "unavailable," never inferred. The guard must refuse to overwrite a live public JSON when the produced record count is below its safety floor.
- **Timezone:** `America/Los_Angeles`. Date strings are passed in by callers (the guard takes `today` as a parameter) so functions stay deterministic and DST-safe.
- **Copy rules (brand):** any user-facing string this code emits (e.g. review-board labels) uses no em-dashes, no emojis, sentence case, plain verbs.
- **Never bypass anti-bot controls:** fetch wrappers set a real User-Agent and throttle; they never rotate proxies or defeat rate limits.

---

## File Structure

- Create `shared/__init__.py` — marks the package.
- Create `shared/bcl_ingest.py` — the core library (all functions/classes below).
- Create `shared/review_board.py` — the browser review-board HTML generator.
- Create `data/commute_table.json` — static city → drive-minutes table.
- Create `conftest.py` (repo root) — anchors pytest rootdir so `from shared... import` works.
- Create `tests/test_bcl_ingest.py` — unit tests for the core library.
- Create `tests/test_review_board.py` — unit tests for the review-board generator.
- Create `requirements-dev.txt` — pins `pytest`.
- Modify `.gitignore` — ignore private files and Python caches.

---

## Task 1: Scaffold the package, test harness, and gitignore

**Files:**
- Create: `shared/__init__.py`
- Create: `conftest.py`
- Create: `requirements-dev.txt`
- Modify: `.gitignore`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces: an importable `shared` package and a working `pytest` invocation from the repo root.

- [ ] **Step 1: Create the package marker and dev requirements**

Create `shared/__init__.py` with a single line:

```python
"""Shared ingest foundation for the Boulder Creek Local jobs & rentals tools."""
```

Create `requirements-dev.txt`:

```text
pytest>=8.0
```

Create `conftest.py` at the repo root (empty file is enough; its presence sets the pytest rootdir so `from shared.bcl_ingest import ...` resolves):

```python
# Presence of this file anchors pytest's rootdir at the repo root
# so tests can import the `shared` package.
```

- [ ] **Step 2: Update .gitignore for private files and Python caches**

Append to `.gitignore` (create the file if missing):

```gitignore
# Jobs & Rentals tools — private, never published
review/
partials/detail_cache.json

# Python
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 3: Write a smoke test that the package imports**

Create `tests/test_bcl_ingest.py`:

```python
def test_package_imports():
    import shared.bcl_ingest  # noqa: F401
```

- [ ] **Step 4: Install pytest and run the smoke test (expect FAIL — module missing)**

Run: `python -m pip install pytest`
Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.bcl_ingest'`.

- [ ] **Step 5: Create an empty module so the import resolves**

Create `shared/bcl_ingest.py`:

```python
"""Core ingest helpers shared by the jobs and rentals refresh pipelines."""
```

- [ ] **Step 6: Run the smoke test (expect PASS)**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/__init__.py shared/bcl_ingest.py conftest.py requirements-dev.txt .gitignore tests/test_bcl_ingest.py
git commit -m "feat(ingest): scaffold shared package + pytest harness"
```

---

## Task 2: Text sanitize, slug, and URL normalization

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sanitize_text(value) -> str` — strip tags/entities, collapse whitespace.
  - `make_slug(*parts) -> str` — url-safe slug from any parts.
  - `normalize_url(url) -> str` — drop query string, keep path + fragment.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import sanitize_text, make_slug, normalize_url


def test_sanitize_strips_tags_and_collapses_space():
    assert sanitize_text("<p>Hello   &amp;  world</p>\n") == "Hello & world"

def test_sanitize_handles_none():
    assert sanitize_text(None) == ""

def test_make_slug_basic():
    assert make_slug("Line Cook", "New Leaf Market") == "line-cook-new-leaf-market"

def test_make_slug_empty_fallback():
    assert make_slug("", None) == "item"

def test_normalize_url_drops_query_keeps_fragment():
    assert normalize_url("https://x.com/jobs/?utm=1#/jobs/9") == "https://x.com/jobs#/jobs/9"

def test_normalize_url_equal_after_tracking_strip():
    a = normalize_url("https://x.com/j/5?src=fb")
    b = normalize_url("https://x.com/j/5?ref=tw")
    assert a == b
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'sanitize_text'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py`:

```python
import html
import re
from urllib.parse import urlsplit, urlunsplit

_TAG_RE = re.compile(r"<[^>]+>")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def sanitize_text(value):
    """Strip HTML tags/entities and collapse whitespace to a single-line string."""
    if value is None:
        return ""
    text = _TAG_RE.sub(" ", str(value))
    text = html.unescape(text)
    text = text.replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def make_slug(*parts):
    """Build a url-safe slug from the given parts; 'item' if everything is empty."""
    joined = " ".join(str(p) for p in parts if p).lower()
    slug = _SLUG_RE.sub("-", joined).strip("-")
    return slug or "item"


def normalize_url(url):
    """Drop the query string (tracking) but keep path and fragment (SPA routes)."""
    if not url:
        return ""
    parts = urlsplit(str(url).strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", parts.fragment))
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): text sanitize, slug, url normalization"
```

---

## Task 3: Fingerprint and dedup

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: `sanitize_text`.
- Produces:
  - `record_fingerprint(values) -> str` — stable hex hash of normalized values.
  - `dedupe_by(records, keyfn) -> list` — first-wins dedup, order preserved.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import record_fingerprint, dedupe_by


def test_fingerprint_stable_and_case_insensitive():
    a = record_fingerprint(["Line Cook", "New Leaf", "Santa Cruz"])
    b = record_fingerprint(["line cook", "NEW LEAF", "santa cruz"])
    assert a == b and len(a) == 40

def test_fingerprint_differs_on_content():
    assert record_fingerprint(["a"]) != record_fingerprint(["b"])

def test_dedupe_by_keeps_first_preserves_order():
    rows = [{"id": 1, "k": "x"}, {"id": 2, "k": "y"}, {"id": 3, "k": "x"}]
    out = dedupe_by(rows, lambda r: r["k"])
    assert [r["id"] for r in out] == [1, 2]
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'record_fingerprint'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py` (add `import hashlib` near the other imports):

```python
import hashlib


def record_fingerprint(values):
    """Stable 40-char hex fingerprint from normalized field values (order matters)."""
    norm = "|".join(sanitize_text(v).lower() for v in values)
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def dedupe_by(records, keyfn):
    """Return records unique by keyfn(record), keeping the first occurrence."""
    seen = set()
    out = []
    for rec in records:
        key = keyfn(rec)
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): record fingerprint + dedup"
```

---

## Task 4: Commute table, geo classification, commute lookup

**Files:**
- Create: `data/commute_table.json`
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `classify_geo(city) -> str` — "core" | "extended" | "unknown".
  - `commute_minutes(city) -> int | None` — approximate drive minutes from Boulder Creek.

- [ ] **Step 1: Create the static commute table**

Create `data/commute_table.json` (minutes are approximate, editable estimates from downtown Boulder Creek 95006):

```json
{
  "Boulder Creek": {"minutes": 0, "tier": "core"},
  "Brookdale": {"minutes": 6, "tier": "core"},
  "Ben Lomond": {"minutes": 9, "tier": "core"},
  "Felton": {"minutes": 12, "tier": "core"},
  "Mount Hermon": {"minutes": 12, "tier": "core"},
  "Zayante": {"minutes": 14, "tier": "core"},
  "Lompico": {"minutes": 14, "tier": "core"},
  "Bonny Doon": {"minutes": 20, "tier": "core"},
  "Scotts Valley": {"minutes": 20, "tier": "core"},
  "Los Gatos": {"minutes": 25, "tier": "core"},
  "Santa Cruz": {"minutes": 30, "tier": "core"},
  "Live Oak": {"minutes": 33, "tier": "core"},
  "Capitola": {"minutes": 35, "tier": "core"},
  "Soquel": {"minutes": 35, "tier": "core"},
  "Aptos": {"minutes": 40, "tier": "core"},
  "Rio del Mar": {"minutes": 43, "tier": "core"},
  "Davenport": {"minutes": 45, "tier": "extended"},
  "Watsonville": {"minutes": 50, "tier": "extended"},
  "Campbell": {"minutes": 35, "tier": "extended"},
  "Santa Clara": {"minutes": 45, "tier": "extended"},
  "San Jose": {"minutes": 45, "tier": "extended"},
  "Monterey": {"minutes": 70, "tier": "extended"}
}
```

- [ ] **Step 2: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import classify_geo, commute_minutes


def test_classify_geo_core_extended_unknown():
    assert classify_geo("Boulder Creek") == "core"
    assert classify_geo("Los Gatos") == "core"
    assert classify_geo("San Jose") == "extended"
    assert classify_geo("Fresno") == "unknown"

def test_classify_geo_trims_and_handles_none():
    assert classify_geo("  Felton ") == "core"
    assert classify_geo(None) == "unknown"

def test_commute_minutes():
    assert commute_minutes("Los Gatos") == 25
    assert commute_minutes("Fresno") is None
```

- [ ] **Step 3: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'classify_geo'`.

- [ ] **Step 4: Implement**

Add to `shared/bcl_ingest.py` (add `import json` and `import os` near the top imports):

```python
import json
import os

_COMMUTE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "commute_table.json")
_COMMUTE_CACHE = None


def _commute_table():
    global _COMMUTE_CACHE
    if _COMMUTE_CACHE is None:
        with open(_COMMUTE_PATH, encoding="utf-8") as fh:
            _COMMUTE_CACHE = json.load(fh)
    return _COMMUTE_CACHE


def classify_geo(city):
    """Return the geography tier for a work city: core, extended, or unknown."""
    row = _commute_table().get((city or "").strip())
    return row["tier"] if row else "unknown"


def commute_minutes(city):
    """Approximate drive minutes from Boulder Creek for a work city, or None."""
    row = _commute_table().get((city or "").strip())
    return row["minutes"] if row else None
```

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/commute_table.json shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): static commute table + geo classification"
```

---

## Task 5: Strict 95006 ZIP validation (rentals)

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `is_95006(rec) -> bool` — True only when the record is confirmably in ZIP 95006.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import is_95006


def test_is_95006_by_postal_code():
    assert is_95006({"postal_code": "95006"}) is True

def test_is_95006_by_address_field():
    assert is_95006({"address_public": "123 Main St, Boulder Creek, CA 95006"}) is True

def test_is_95006_rejects_other_zip():
    assert is_95006({"postal_code": "95005", "address_public": "Ben Lomond CA 95005"}) is False

def test_is_95006_rejects_city_label_only():
    # A "Boulder Creek" label with no ZIP evidence is not sufficient.
    assert is_95006({"city": "Boulder Creek"}) is False

def test_is_95006_ignores_zip_only_in_description():
    # Mentioning 95006 in prose is not location evidence.
    assert is_95006({"description_summary": "near 95006 area", "postal_code": ""}) is False
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'is_95006'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py`:

```python
_ZIP_95006_RE = re.compile(r"\b95006\b")


def is_95006(rec):
    """True only when a record is confirmably in ZIP 95006.

    Evidence = an exact postal_code of 95006, or 95006 appearing in a structured
    address field. A bare "Boulder Creek" label or a ZIP mentioned only in prose
    is NOT sufficient (search pages bleed into 95005/95007/95018).
    """
    if str(rec.get("postal_code", "")).strip() == "95006":
        return True
    for field in ("address_public", "address_normalized"):
        if _ZIP_95006_RE.search(str(rec.get(field, "") or "")):
            return True
    return False
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): strict 95006 ZIP validation"
```

---

## Task 6: Detail cache with TTL

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `DetailCache(path, ttl_days=7, now=None)` with `.get(url)`, `.set(url, value)`, `.save()`.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import DetailCache


def test_detail_cache_set_get(tmp_path):
    clock = [1000.0]
    c = DetailCache(str(tmp_path / "cache.json"), ttl_days=7, now=lambda: clock[0])
    c.set("https://x/1", {"pay": "$20/hr"})
    assert c.get("https://x/1") == {"pay": "$20/hr"}

def test_detail_cache_expires(tmp_path):
    clock = [1000.0]
    c = DetailCache(str(tmp_path / "cache.json"), ttl_days=7, now=lambda: clock[0])
    c.set("https://x/1", {"pay": "$20/hr"})
    clock[0] = 1000.0 + 8 * 86400  # 8 days later, past the 7-day TTL
    assert c.get("https://x/1") is None

def test_detail_cache_persists_across_instances(tmp_path):
    path = str(tmp_path / "cache.json")
    clock = [1000.0]
    c1 = DetailCache(path, now=lambda: clock[0])
    c1.set("https://x/1", "verdict")
    c1.save()
    c2 = DetailCache(path, now=lambda: clock[0])
    assert c2.get("https://x/1") == "verdict"

def test_detail_cache_missing_returns_none(tmp_path):
    c = DetailCache(str(tmp_path / "cache.json"))
    assert c.get("https://x/nope") is None
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'DetailCache'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py` (add `import time` near the top imports):

```python
import time


class DetailCache:
    """Per-URL cache of detail-page verdicts (pay/benefits/hours), with a TTL so
    stale 'no data' verdicts get rechecked. Machine-local; never published."""

    def __init__(self, path, ttl_days=7, now=None):
        self.path = path
        self.ttl = ttl_days * 86400
        self._now = now or time.time
        self.data = {}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as fh:
                    self.data = json.load(fh)
            except (ValueError, OSError):
                self.data = {}

    def get(self, url):
        entry = self.data.get(url)
        if not entry:
            return None
        if self._now() - entry.get("ts", 0) > self.ttl:
            return None
        return entry.get("value")

    def set(self, url, value):
        self.data[url] = {"ts": self._now(), "value": value}

    def save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh)
        os.replace(tmp, self.path)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): detail cache with TTL"
```

---

## Task 7: JSON I/O and the MIN_SAFE_TOTAL guard

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GuardError` (exception).
  - `load_json(path, default=None)`.
  - `write_json_atomic(path, obj)`.
  - `write_public_json_guarded(path, key, records, min_total, note, today) -> dict` — writes `{_note, updated, count, <key>: records}`; raises `GuardError` when `len(records) < min_total`.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
import json as _json
import pytest
from shared.bcl_ingest import (
    GuardError, load_json, write_json_atomic, write_public_json_guarded,
)


def test_load_json_missing_returns_default(tmp_path):
    assert load_json(str(tmp_path / "nope.json"), default=[]) == []

def test_write_and_load_roundtrip(tmp_path):
    p = str(tmp_path / "out.json")
    write_json_atomic(p, {"a": 1})
    assert load_json(p) == {"a": 1}

def test_guarded_write_publishes_when_enough(tmp_path):
    p = str(tmp_path / "jobs.json")
    recs = [{"id": 1}, {"id": 2}, {"id": 3}]
    payload = write_public_json_guarded(p, "jobs", recs, min_total=2, note="n", today="2026-07-19")
    assert payload["count"] == 3 and payload["updated"] == "2026-07-19"
    on_disk = _json.loads(open(p, encoding="utf-8").read())
    assert on_disk["jobs"][0]["id"] == 1 and on_disk["_note"] == "n"

def test_guard_refuses_when_too_few(tmp_path):
    p = str(tmp_path / "jobs.json")
    open(p, "w").write('{"count": 99}')  # existing good file must be left intact
    with pytest.raises(GuardError):
        write_public_json_guarded(p, "jobs", [{"id": 1}], min_total=5, note="n", today="2026-07-19")
    assert _json.loads(open(p, encoding="utf-8").read())["count"] == 99
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'GuardError'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py`:

```python
class GuardError(Exception):
    """Raised when a run produces too few records to safely overwrite live data."""


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def write_public_json_guarded(path, key, records, min_total, note, today):
    """Write the public payload only when it clears the safety floor.

    A broken scrape must never blank or shrink the live board: if fewer than
    min_total records were produced, raise GuardError WITHOUT touching the file,
    so the .bat wrapper sees a nonzero exit and skips the commit/push.
    """
    if len(records) < min_total:
        raise GuardError(
            "refusing to write %s: %d records < MIN_SAFE_TOTAL %d"
            % (path, len(records), min_total)
        )
    payload = {"_note": note, "updated": today, "count": len(records), key: records}
    write_json_atomic(path, payload)
    return payload
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): json io + MIN_SAFE_TOTAL guard"
```

---

## Task 8: Fetch wrappers (HTTP + firecrawl), injectable for testing

**Files:**
- Modify: `shared/bcl_ingest.py`
- Test: `tests/test_bcl_ingest.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `http_get(url, timeout=25, min_interval=0.0, opener=None) -> str`.
  - `http_json(url, **kw) -> object`.
  - `firecrawl_markdown(url, runner=None) -> str`.

Note on injection: `opener` (for `http_get`) and `runner` (for `firecrawl_markdown`) let tests supply fakes so no network or CLI is touched. Production defaults hit `urllib` and the `firecrawl` CLI.

**Build-time note:** confirm the exact `firecrawl` CLI invocation against EOB's working `refresh_roles.py` (it calls firecrawl successfully today) and match its arguments; adjust `_run_firecrawl` if EOB uses a different subcommand/flags.

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bcl_ingest.py`:

```python
from shared.bcl_ingest import http_get, http_json, firecrawl_markdown


class _FakeResp:
    def __init__(self, body):
        self._body = body
    def read(self):
        return self._body.encode("utf-8")
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False


def test_http_get_uses_opener_and_decodes():
    captured = {}
    def fake_opener(req, timeout=None):
        captured["ua"] = req.get_header("User-agent")
        captured["url"] = req.full_url
        return _FakeResp("hello")
    assert http_get("https://x/1", opener=fake_opener) == "hello"
    assert captured["url"] == "https://x/1"
    assert "BoulderCreekLocal" in captured["ua"]

def test_http_json_parses():
    def fake_opener(req, timeout=None):
        return _FakeResp('{"a": 1}')
    assert http_json("https://x/1", opener=fake_opener) == {"a": 1}

def test_firecrawl_markdown_uses_runner():
    assert firecrawl_markdown("https://x/1", runner=lambda u: "# md " + u) == "# md https://x/1"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: FAIL — `ImportError: cannot import name 'http_get'`.

- [ ] **Step 3: Implement**

Add to `shared/bcl_ingest.py` (add `import subprocess` and the urllib import near the top imports):

```python
import subprocess
from urllib.request import Request, urlopen

USER_AGENT = "BoulderCreekLocal/1.0 (+https://bouldercreeklocal.com)"
_LAST_FETCH = [0.0]


def _throttle(min_interval, sleep=time.sleep, monotonic=time.monotonic):
    if min_interval <= 0:
        return
    elapsed = monotonic() - _LAST_FETCH[0]
    if elapsed < min_interval:
        sleep(min_interval - elapsed)
    _LAST_FETCH[0] = monotonic()


def http_get(url, timeout=25, min_interval=0.0, opener=None):
    """Fetch a URL as text with a real User-Agent and optional throttle.

    Pass `opener` in tests to avoid the network. Never bypasses anti-bot controls.
    """
    _throttle(min_interval)
    fetch = opener or urlopen
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with fetch(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def http_json(url, **kwargs):
    return json.loads(http_get(url, **kwargs))


def firecrawl_markdown(url, runner=None):
    """Scrape a page to markdown via the firecrawl CLI. Pass `runner` in tests."""
    run = runner or _run_firecrawl
    return run(url)


def _run_firecrawl(url):
    result = subprocess.run(
        ["firecrawl", "scrape", url, "--format", "markdown"],
        capture_output=True, text=True, timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError("firecrawl failed: " + (result.stderr or "")[:200])
    return result.stdout
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_bcl_ingest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/bcl_ingest.py tests/test_bcl_ingest.py
git commit -m "feat(ingest): injectable http + firecrawl fetch wrappers"
```

---

## Task 9: Review-board HTML generator

**Files:**
- Create: `shared/review_board.py`
- Test: `tests/test_review_board.py`

**Interfaces:**
- Consumes: `sanitize_text` from `shared.bcl_ingest`.
- Produces: `render_review_board(items, tool, out_path) -> str` — writes a self-contained tap-to-approve HTML page and returns the HTML string. Each item is a dict with at least `id`, `title`, and `subtitle`; `detail` and `url` are optional.

- [ ] **Step 1: Write failing tests**

Create `tests/test_review_board.py`:

```python
from shared.review_board import render_review_board


ITEMS = [
    {"id": "job-1", "title": "Line Cook", "subtitle": "New Leaf, Santa Cruz", "url": "https://x/1"},
    {"id": "rent-2", "title": "2BR Cottage", "subtitle": "Boulder Creek 95006"},
]


def test_render_writes_file_and_returns_html(tmp_path):
    out = str(tmp_path / "review.html")
    html = render_review_board(ITEMS, tool="jobs", out_path=out)
    assert html.startswith("<!doctype html>")
    on_disk = open(out, encoding="utf-8").read()
    assert on_disk == html

def test_render_includes_every_item_id_and_title():
    html = render_review_board(ITEMS, tool="jobs", out_path=None)
    assert "job-1" in html and "rent-2" in html
    assert "Line Cook" in html and "2BR Cottage" in html

def test_render_escapes_html_in_fields():
    html = render_review_board(
        [{"id": "x", "title": "<script>alert(1)</script>", "subtitle": "s"}],
        tool="jobs", out_path=None,
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html

def test_render_has_approve_and_copy_controls():
    html = render_review_board(ITEMS, tool="jobs", out_path=None)
    assert "Copy approved" in html
    assert "localStorage" in html
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_review_board.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.review_board'`.

- [ ] **Step 3: Implement**

Create `shared/review_board.py`:

```python
"""Generate a self-contained browser page for the owner to approve/reject queued
listings (the same tap-to-pick pattern used for the directory logo confirmations).
Approvals are collected client-side and copied out as a list of ids to merge into
partials/manual-*.json. No network, no framework, one file."""

import html as _html

from shared.bcl_ingest import sanitize_text

_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boulder Creek Local - review {tool}</title>
<style>
 body{{font-family:Inter,Arial,sans-serif;color:#1c2a26;background:#f5f1e7;margin:0;padding:18px;}}
 h1{{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36;font-size:1.5rem;}}
 .card{{background:#fffdf8;border:1px solid #e3ddcf;padding:14px 16px;margin:0 0 12px;border-radius:4px;}}
 .card.approved{{border-color:#2f6754;box-shadow:inset 0 0 0 2px #2f6754;}}
 .card.rejected{{opacity:.5;}}
 .title{{font-weight:600;color:#173f36;font-size:1.05rem;}}
 .sub{{font-size:.82rem;color:#2f6754;margin:2px 0 6px;}}
 .detail{{font-size:.9rem;color:#1c2a26;margin:0 0 8px;}}
 a{{color:#2e6b46;}}
 button{{font:inherit;padding:8px 14px;margin:4px 6px 0 0;border:1px solid #cfc9b8;background:#fffdf8;cursor:pointer;border-radius:3px;}}
 .bar{{position:sticky;top:0;background:#f5f1e7;padding:10px 0;}}
 #out{{width:100%;min-height:64px;margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:.8rem;}}
</style></head><body>
<h1>Review queued {tool}</h1>
<div class="bar"><button onclick="copyApproved()">Copy approved</button>
<span id="tally"></span></div>
{cards}
<textarea id="out" placeholder="Approved ids appear here after you tap Copy approved"></textarea>
<script>
 var KEY="bcl-review-{tool}";
 var state=JSON.parse(localStorage.getItem(KEY)||"{{}}");
 function set(id,v){{state[id]=v;localStorage.setItem(KEY,JSON.stringify(state));paint();}}
 function paint(){{
   var a=0;
   document.querySelectorAll(".card").forEach(function(c){{
     var id=c.getAttribute("data-id"),s=state[id];
     c.classList.toggle("approved",s==="approve");
     c.classList.toggle("rejected",s==="reject");
     if(s==="approve")a++;
   }});
   document.getElementById("tally").textContent=a+" approved";
 }}
 function copyApproved(){{
   var ids=Object.keys(state).filter(function(k){{return state[k]==="approve";}});
   document.getElementById("out").value=ids.join("\\n");
 }}
 paint();
</script>
</body></html>"""

_CARD = """<div class="card" data-id="{id}">
<div class="title">{title}</div><div class="sub">{subtitle}</div>
{detail}{link}
<button onclick="set('{id}','approve')">Approve</button>
<button onclick="set('{id}','reject')">Reject</button></div>"""


def render_review_board(items, tool, out_path):
    cards = []
    for item in items:
        item_id = _html.escape(str(item.get("id", "")))
        detail = item.get("detail")
        url = item.get("url")
        cards.append(_CARD.format(
            id=item_id,
            title=_html.escape(sanitize_text(item.get("title"))),
            subtitle=_html.escape(sanitize_text(item.get("subtitle"))),
            detail='<div class="detail">%s</div>' % _html.escape(sanitize_text(detail)) if detail else "",
            link='<div><a href="%s" target="_blank" rel="noopener">View source</a></div>' % _html.escape(str(url)) if url else "",
        ))
    page = _PAGE.format(tool=_html.escape(str(tool)), cards="\n".join(cards))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(page)
    return page
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_review_board.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -v`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add shared/review_board.py tests/test_review_board.py
git commit -m "feat(review): browser review-board generator"
```

---

## Self-Review Notes (author check against the spec)

- **§2 repo layout** — `shared/bcl_ingest.py`, `shared/review_board.py`, `data/`, `review/` (gitignored), `partials/detail_cache.json` (gitignored): covered by Tasks 1, 6, 9.
- **§3 data flow** — sanitize, dedup, location validation, JSON I/O, guard: Tasks 2, 3, 4, 5, 7. (Normalize/enrich/publish orchestration lives in the jobs/rentals pipeline plans, which consume these.)
- **§4 review board** — Task 9 (approvals → copy ids → merge into `partials/`; the merge itself is a pipeline-plan step).
- **§5.1 commute/geo** — Task 4, with Los Gatos in core at ~25 min.
- **§6.1 strict 95006** — Task 5, rejecting city-label-only and prose mentions.
- **§3 guard / trust rule** — Task 7 (`MIN_SAFE_TOTAL`, never blanks live data).
- **Detail enrichment cache (§5.4)** — Task 6 (`DetailCache` TTL for pay/benefits/hours verdicts).
- **Fetch discipline (§8 error handling, no anti-bot bypass)** — Task 8 (User-Agent, throttle, injectable).

**Out of scope for this plan (later plans):** source registries + parsers (plan 2), normalize/inclusion/enrich/publish orchestration and the `.bat`/schedule (plans 3–4), rendering (plan 5), submission forms (plan 6). This plan delivers only the shared, offline-testable foundation, and it stands alone: `python -m pytest -v` is green with zero network access.

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency:** `sanitize_text` (Task 2) is reused in Tasks 3 and 9; `DetailCache` signature (Task 6) matches its test; `write_public_json_guarded(path, key, records, min_total, note, today)` is consistent between implementation and tests in Task 7.
