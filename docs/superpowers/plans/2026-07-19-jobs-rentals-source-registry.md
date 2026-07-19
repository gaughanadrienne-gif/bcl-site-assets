# Jobs & Rentals Source Registry — Implementation Plan (Plan 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Encode the verified source research into validated, importable Python registries (`jobs/sources.py`, `rentals/sources.py`) that the refresh pipelines (plans 3-4) iterate over, with a `shared/registry.py` that validates every source's shape and enforces the onboarding safety gate (no automated collection from a source until its terms are reviewed, and discovery-only platforms are never auto-collected).

**Architecture:** Each source is a plain `dict` with a fixed schema. `shared/registry.py` provides the enums and `validate_registry(sources)`. The two registry modules are pure data + a module-level validation call. No network, fully offline-testable.

**Tech Stack:** Python 3.9+ stdlib, pytest. Depends on plan 1's `shared/` package existing (it does).

## Global Constraints

- Working dir: repo root `C:\Users\Adrie\OneDrive\Businesses\Boulder Creek Local\Website\bcl-site-assets`. Branch `feature/jobs-rentals-tools` (already checked out). Do not push.
- Stdlib + pytest only.
- **Onboarding safety gate (encoded as validation):** a source with `enabled=True` must have `terms_ok=True` and a `collection_class` that is not `discovery_only` or `disabled`. A `discovery_only` source must have `enabled=False` (it is link-out only, never scraped).
- Source data is derived from `docs/superpowers/research/source-registry-raw.md`. Where the research flagged low confidence or a needed JS-render/terms check, the source is encoded with `enabled=False` until onboarded — honest current state, not aspirational.
- Commit after each task with the given message, ending the body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015SCgK4dTBfHVou7zzErTnx`.

## Source schema (every registry entry)

```
name            str, unique across a registry
tool            "jobs" | "rentals"
collection_class one of COLLECTION_CLASSES (spec section 4)
platform        str family tag (neogov, edjoin, jobaps, calopps, workday, icims,
                dayforce, paycom, paylocity, adp, oracle, avature, saashr, talentreef,
                phenom, peoplesoft, taleo, rss, remote_json, appfolio, rentvine,
                custom_html, discovery, submission)
parser          str, must be in KNOWN_PARSERS (maps to a plan 3-4 parser family)
url             str, must start with http
geo             "area" | "remote" | "employer:<City>"   (default-worksite hint)
priority        int (lower = higher priority)
enabled         bool  (does the daily run collect it yet)
terms_ok        bool  (robots/terms reviewed and permit automated read)
notes           str (optional)
config          dict (optional; platform specifics: tenant, clientkey, slug, keyword)
```

---

## Task 1: registry schema + validation

**Files:**
- Create: `shared/registry.py`
- Test: `tests/test_registry.py`

**Interfaces:**
- Produces:
  - `COLLECTION_CLASSES` (frozenset), `KNOWN_PARSERS` (frozenset), `REQUIRED_FIELDS` (tuple).
  - `RegistryError` (exception).
  - `validate_registry(sources) -> list` — returns the list unchanged if every source is valid and names are unique; raises `RegistryError` with a message naming the offending source otherwise.

- [ ] **Step 1: Write failing tests**

Create `tests/test_registry.py`:

```python
import pytest
from shared.registry import validate_registry, RegistryError


def _src(**over):
    base = dict(
        name="X", tool="jobs", collection_class="direct_page_reviewed",
        platform="neogov", parser="neogov", url="https://x.test/jobs",
        geo="area", priority=10, enabled=True, terms_ok=True,
    )
    base.update(over)
    return base


def test_valid_registry_passes_through():
    src = [_src(name="A"), _src(name="B")]
    assert validate_registry(src) is src

def test_missing_field_raises():
    bad = _src()
    del bad["url"]
    with pytest.raises(RegistryError):
        validate_registry([bad])

def test_bad_collection_class_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(collection_class="nonsense")])

def test_unknown_parser_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(parser="magic")])

def test_url_must_be_http():
    with pytest.raises(RegistryError):
        validate_registry([_src(url="ftp://x/y")])

def test_duplicate_names_raise():
    with pytest.raises(RegistryError):
        validate_registry([_src(name="A"), _src(name="A")])

def test_enabled_requires_terms_ok():
    with pytest.raises(RegistryError):
        validate_registry([_src(enabled=True, terms_ok=False)])

def test_enabled_discovery_only_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(collection_class="discovery_only", enabled=True, terms_ok=True)])

def test_discovery_only_disabled_is_valid():
    assert validate_registry([_src(collection_class="discovery_only", parser="discovery",
                                   enabled=False, terms_ok=False)])
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.registry'`.

- [ ] **Step 3: Implement**

Create `shared/registry.py`:

```python
"""Source-registry schema, enums, and validation for the jobs & rentals tools."""

COLLECTION_CLASSES = frozenset({
    "api_authorized", "feed_authorized", "direct_page_reviewed", "email_alert",
    "submission", "manual_review", "discovery_only", "disabled",
})

KNOWN_PARSERS = frozenset({
    "neogov", "edjoin", "jobaps", "calopps", "workday", "icims", "dayforce",
    "paycom", "paylocity", "adp", "oracle", "avature", "saashr", "talentreef",
    "phenom", "peoplesoft", "taleo", "rss", "remote_json", "appfolio", "rentvine",
    "custom_html", "discovery", "submission",
})

REQUIRED_FIELDS = (
    "name", "tool", "collection_class", "platform", "parser", "url",
    "geo", "priority", "enabled", "terms_ok",
)


class RegistryError(Exception):
    """Raised when a source registry entry is malformed or violates the gate."""


def _check(source):
    name = source.get("name", "<unnamed>")
    for field in REQUIRED_FIELDS:
        if field not in source:
            raise RegistryError("source %r missing required field %r" % (name, field))
    if source["tool"] not in ("jobs", "rentals"):
        raise RegistryError("source %r has bad tool %r" % (name, source["tool"]))
    if source["collection_class"] not in COLLECTION_CLASSES:
        raise RegistryError("source %r has bad collection_class %r" % (name, source["collection_class"]))
    if source["parser"] not in KNOWN_PARSERS:
        raise RegistryError("source %r has unknown parser %r" % (name, source["parser"]))
    if not str(source["url"]).startswith("http"):
        raise RegistryError("source %r url must be http(s): %r" % (name, source["url"]))
    if source["enabled"]:
        if not source["terms_ok"]:
            raise RegistryError("source %r is enabled but terms_ok is False (onboarding gate)" % name)
        if source["collection_class"] in ("discovery_only", "disabled"):
            raise RegistryError("source %r is enabled but collection_class is %r" % (name, source["collection_class"]))
    if source["collection_class"] == "discovery_only" and source["enabled"]:
        raise RegistryError("source %r is discovery_only and must not be enabled" % name)


def validate_registry(sources):
    """Validate every source; ensure names are unique. Return the list unchanged."""
    seen = set()
    for source in sources:
        _check(source)
        if source["name"] in seen:
            raise RegistryError("duplicate source name %r" % source["name"])
        seen.add(source["name"])
    return sources
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_registry.py -v`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/registry.py tests/test_registry.py
git commit -m "feat(registry): source schema + validation with onboarding gate"
```

---

## Task 2: jobs source registry

**Files:**
- Create: `jobs/__init__.py`
- Create: `jobs/sources.py`
- Test: `tests/test_jobs_sources.py`

**Interfaces:**
- Consumes: `validate_registry` from `shared.registry`.
- Produces: `JOB_SOURCES` (list of validated source dicts). Module import validates it (fails fast on a bad edit).

Data comes from `docs/superpowers/research/source-registry-raw.md` Groups A, B, C, D, E. Structured/official public sources are `enabled=True, terms_ok=True`. Sources the research flagged as JS-render-unconfirmed, bot-blocked, contact-only, or low-confidence are `enabled=False` until onboarded. `discovery_only` platforms are link-out only (`enabled=False`).

- [ ] **Step 1: Write failing tests**

Create `tests/test_jobs_sources.py`:

```python
from jobs.sources import JOB_SOURCES
from shared.registry import validate_registry


def test_registry_validates():
    assert validate_registry(JOB_SOURCES) is JOB_SOURCES

def test_all_jobs_tool():
    assert all(s["tool"] == "jobs" for s in JOB_SOURCES)

def test_core_structured_sources_enabled():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    for name in ("County of Santa Cruz", "City of Scotts Valley", "SLVUSD (EDJOIN)",
                 "Second Harvest (RSS)", "Remotive (remote)"):
        assert by_name[name]["enabled"] is True, name

def test_discovery_sources_are_link_out_only():
    for s in JOB_SOURCES:
        if s["collection_class"] == "discovery_only":
            assert s["enabled"] is False

def test_remote_sources_have_remote_geo():
    for s in JOB_SOURCES:
        if s["platform"] == "remote_json" or s["name"].endswith("(remote)"):
            assert s["geo"] == "remote"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_jobs_sources.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'jobs.sources'`.

- [ ] **Step 3: Implement**

Create `jobs/__init__.py`:

```python
"""Boulder Creek Local jobs pipeline."""
```

Create `jobs/sources.py` (encode the registry; the module validates itself on import):

```python
"""Verified jobs source registry. See docs/superpowers/research/source-registry-raw.md.
Enabled sources are official/public and structured. Sources needing a JS-render or
terms check, or flagged low-confidence, are enabled=False until onboarded."""

from shared.registry import validate_registry


def _s(name, cclass, platform, parser, url, geo, priority, enabled, terms_ok, notes="", config=None):
    return dict(name=name, tool="jobs", collection_class=cclass, platform=platform,
                parser=parser, url=url, geo=geo, priority=priority, enabled=enabled,
                terms_ok=terms_ok, notes=notes, config=config or {})


JOB_SOURCES = [
    # --- Government (structured, public) ---
    _s("County of Santa Cruz", "direct_page_reviewed", "jobaps", "jobaps",
       "https://jobapscloud.com/SCRUZ/", "area", 5, True, True, "11 open at check"),
    _s("City of Santa Cruz", "direct_page_reviewed", "neogov", "neogov",
       "https://www.governmentjobs.com/careers/santacruz", "area", 5, True, True),
    _s("City of Scotts Valley", "direct_page_reviewed", "neogov", "neogov",
       "https://www.governmentjobs.com/careers/scottsvalley", "area", 5, True, True),
    _s("Santa Cruz METRO", "direct_page_reviewed", "workday", "workday",
       "https://scmtd.wd12.myworkdayjobs.com/METRO_Careers", "area", 5, True, True,
       "Workday POST json /wday/cxs/scmtd/METRO_Careers/jobs", {"tenant": "scmtd", "site": "METRO_Careers"}),
    _s("Cabrillo College", "direct_page_reviewed", "neogov", "neogov",
       "https://www.schooljobs.com/careers/cabrilloedu", "area", 5, True, True),
    _s("Central Fire District", "direct_page_reviewed", "calopps", "calopps",
       "https://www.calopps.org/central-fire-district-of-santa-cruz-county", "area", 6, True, True),
    _s("City of Capitola", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.cityofcapitola.gov/jobs", "area", 6, False, False, "CivicEngage; JS-render check first"),
    _s("SLV Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.slvwd.com/224/Employment-Opportunities", "area", 7, False, False, "CivicPlus; PDF apply"),
    _s("Scotts Valley Water District", "direct_page_reviewed", "custom_html", "custom_html",
       "https://www.svwd.org/HR", "area", 7, False, False, "custom; PDF"),
    # --- Education (EDJOIN) ---
    _s("SLVUSD (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/Home/Jobs?districtID=813", "area", 5, True, True, "Ben Lomond"),
    _s("Live Oak Elementary (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/LOSD", "area", 5, True, True, "NOT LOUSD Central Valley"),
    _s("Santa Cruz City Schools (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/sccs", "area", 5, True, True),
    _s("Soquel Union (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/suesd", "area", 5, True, True),
    _s("Santa Cruz COE (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/santacruzcoe", "area", 5, True, True),
    _s("Scotts Valley USD (EDJOIN)", "direct_page_reviewed", "edjoin", "edjoin",
       "https://www.edjoin.org/scottsvalley", "area", 5, True, True, "NOT Scott Valley USD Siskiyou"),
    _s("UC Santa Cruz", "direct_page_reviewed", "peoplesoft", "peoplesoft",
       "https://www.ucsc.edu/careers/", "employer:Santa Cruz", 6, False, False, "PeopleSoft; session-gated, render check"),
    # --- Healthcare ---
    _s("Dominican Hospital / CommonSpirit", "direct_page_reviewed", "icims", "icims",
       "https://careers-commonspirit.icims.com/jobs/search?searchLocation=Santa+Cruz", "area", 6, True, True),
    _s("Kaiser Permanente (SC)", "direct_page_reviewed", "taleo", "taleo",
       "https://www.kaiserpermanentejobs.org/location/santa-cruz-jobs/", "area", 6, False, False, "Taleo/TalentBrew; render check"),
    _s("Sutter / PAMF (SC)", "direct_page_reviewed", "phenom", "phenom",
       "https://jobs.sutterhealth.org/us/en/peninsula/south-bay-and-santa-cruz", "area", 7, False, False, "Phenom JS-render"),
    _s("Central CA Alliance for Health", "direct_page_reviewed", "icims", "icims",
       "https://thealliance.health/about-the-alliance/careers/", "employer:Scotts Valley", 7, False, False, "iCIMS widget; verify"),
    # --- Top employers (structured ATS) ---
    _s("Bay Photo Lab", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/sensaria/CANDIDATEPORTAL", "employer:Scotts Valley", 8, True, True),
    _s("New Leaf Community Markets", "direct_page_reviewed", "dayforce", "dayforce",
       "https://jobs.dayforcehcm.com/en-US/gfh/NEWLEAF", "area", 8, True, True),
    _s("Fox Factory", "direct_page_reviewed", "workday", "workday",
       "https://foxfactory.wd1.myworkdayjobs.com/FOX", "area", 9, True, True,
       "geo-filter to Scotts Valley/Watsonville", {"tenant": "foxfactory", "site": "FOX"}),
    _s("Nob Hill Foods / Raley's", "direct_page_reviewed", "oracle", "oracle",
       "https://www.raleys.com/about/careers/job-openings", "area", 9, False, False, "Oracle Recruiting; keyword filter"),
    _s("Safeway (Albertsons)", "direct_page_reviewed", "oracle", "oracle",
       "https://www.albertsonscompanies.com/careers/find-a-job.html", "area", 9, False, False, "Oracle; keyword=Santa Cruz"),
    _s("Joby Aviation", "direct_page_reviewed", "icims", "icims",
       "https://careers-jobyaviation.icims.com/jobs/search", "employer:Santa Cruz", 9, True, True, "HQ Santa Cruz; filter out Marina"),
    _s("HP (Scotts Valley)", "direct_page_reviewed", "phenom", "phenom",
       "https://apply.hp.com/careers", "employer:Scotts Valley", 10, False, False, "Phenom JS-render; ex-Poly"),
    _s("Dream Inn Santa Cruz", "direct_page_reviewed", "paylocity", "paylocity",
       "https://recruiting.paylocity.com/recruiting/jobs/All/076ee35d-2815-45ca-a6dc-38be74644a87/Dream-Inn", "employer:Santa Cruz", 10, True, True),
    _s("Seascape Beach Resort", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=2CE0D003E3DAA595D0729714541C982F", "employer:Aptos", 10, True, True),
    _s("Community Bridges", "direct_page_reviewed", "paycom", "paycom",
       "https://www.paycomonline.net/v4/ats/web.php/jobs?clientkey=5FDAD4C9F20D7D00310983697A309125", "area", 9, True, True),
    _s("Housing Matters", "direct_page_reviewed", "adp", "adp",
       "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=b7df2a1a-d18b-4096-b14f-3ec9f379f3be", "employer:Santa Cruz", 9, True, True),
    _s("Second Harvest (RSS)", "feed_authorized", "rss", "rss",
       "https://client.hrservicesinc.com/downloads/rss/portals/9876.xml", "area", 8, True, True, "cleanest feed; RSS template"),
    _s("Google (Santa Cruz)", "direct_page_reviewed", "custom_html", "custom_html",
       "https://careers.google.com/jobs/results/?location=Santa%20Cruz", "employer:Santa Cruz", 12, False, False, "office unconfirmed; owner decision"),
    # --- Local boards ---
    _s("Santa Cruz Works", "direct_page_reviewed", "custom_html", "custom_html",
       "https://santacruzworks.org/jobs", "area", 12, False, False, "Airtable-embedded; JS render"),
    _s("Lookout Santa Cruz job board", "direct_page_reviewed", "custom_html", "custom_html",
       "https://lookout.co/santa-cruz-county-job-board", "area", 12, False, False, "check membership gating"),
    # --- Remote (free feeds) ---
    _s("Remotive (remote)", "api_authorized", "remote_json", "remote_json",
       "https://remotive.com/api/remote-jobs", "remote", 15, True, True,
       "must link back + credit; ~4 req/day", {"eligibility_field": "candidate_required_location"}),
    _s("We Work Remotely (remote)", "feed_authorized", "rss", "rss",
       "https://weworkremotely.com/remote-jobs.rss", "remote", 15, True, True, "region/country/state tags"),
    _s("RemoteOK (remote)", "api_authorized", "remote_json", "remote_json",
       "https://remoteok.com/api", "remote", 16, False, False, "403 to plain fetch; needs browser UA"),
    _s("Working Nomads (remote)", "api_authorized", "remote_json", "remote_json",
       "https://www.workingnomads.com/api/exposed_jobs/", "remote", 16, False, False, "no published terms; verify"),
    # --- Discovery-only (link out, never scraped) ---
    _s("LinkedIn Jobs", "discovery_only", "discovery", "discovery",
       "https://www.linkedin.com/jobs/search/?location=Santa%20Cruz%20County", "area", 30, False, False),
    _s("Indeed", "discovery_only", "discovery", "discovery",
       "https://www.indeed.com/jobs?l=Boulder+Creek%2C+CA", "area", 30, False, False),
]

validate_registry(JOB_SOURCES)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_jobs_sources.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobs/__init__.py jobs/sources.py tests/test_jobs_sources.py
git commit -m "feat(registry): verified jobs source registry"
```

---

## Task 3: rentals source registry

**Files:**
- Create: `rentals/__init__.py`
- Create: `rentals/sources.py`
- Test: `tests/test_rentals_sources.py`

**Interfaces:**
- Consumes: `validate_registry` from `shared.registry`.
- Produces: `RENTAL_SOURCES` (validated). Only property managers with confirmed live 95006 inventory are `enabled=True`; the rest are `enabled=False` pending a recheck/JS-render. Aggregators are `discovery_only`.

- [ ] **Step 1: Write failing tests**

Create `tests/test_rentals_sources.py`:

```python
from rentals.sources import RENTAL_SOURCES
from shared.registry import validate_registry


def test_registry_validates():
    assert validate_registry(RENTAL_SOURCES) is RENTAL_SOURCES

def test_all_rentals_tool():
    assert all(s["tool"] == "rentals" for s in RENTAL_SOURCES)

def test_confirmed_95006_managers_enabled():
    by_name = {s["name"]: s for s in RENTAL_SOURCES}
    for name in ("Scotts Valley Property Management", "PMI Santa Cruz", "Streamline 831"):
        assert by_name[name]["enabled"] is True, name

def test_aggregators_are_discovery_only_and_disabled():
    for name in ("Zillow (95006)", "Apartments.com (Boulder Creek)"):
        s = next(x for x in RENTAL_SOURCES if x["name"] == name)
        assert s["collection_class"] == "discovery_only" and s["enabled"] is False

def test_excluded_managers_absent_or_disabled():
    # Kendall & Potter and Cheshire Rio do not serve 95006 long-term
    for s in RENTAL_SOURCES:
        if s["name"] in ("Kendall & Potter", "Cheshire Rio Realty"):
            assert s["enabled"] is False
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_rentals_sources.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'rentals.sources'`.

- [ ] **Step 3: Implement**

Create `rentals/__init__.py`:

```python
"""Boulder Creek Local rentals pipeline."""
```

Create `rentals/sources.py`:

```python
"""Verified rentals source registry (ZIP 95006 only).
Confirmed live 95006 inventory -> enabled. Rotating/unconfirmed -> enabled=False.
Aggregators -> discovery_only (link out, never scraped)."""

from shared.registry import validate_registry


def _s(name, cclass, platform, parser, url, priority, enabled, terms_ok, notes="", config=None):
    return dict(name=name, tool="rentals", collection_class=cclass, platform=platform,
                parser=parser, url=url, geo="area", priority=priority, enabled=enabled,
                terms_ok=terms_ok, notes=notes, config=config or {})


RENTAL_SOURCES = [
    # --- Confirmed live 95006 inventory (build first) ---
    _s("Scotts Valley Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://scottsvalley.appfolio.com/listings", 5, True, True,
       "14630 Two Bar Rd #5 confirmed", {"slug": "scottsvalley"}),
    _s("PMI Santa Cruz", "direct_page_reviewed", "rentvine", "rentvine",
       "https://www.pmisantacruz.com/santa-cruz-homes-for-rent", 5, True, True,
       "12895 Highway 9 confirmed; RentVine widget", {"portal": "pmisantacruz.rentvine.com"}),
    _s("Streamline 831", "direct_page_reviewed", "custom_html", "custom_html",
       "https://streamline831.com/rental-listings/", 5, True, True, "13350 Big Basin Way confirmed"),
    # --- Serve SLV, rotate into 95006 -> recheck (disabled until confirmed/rendered) ---
    _s("Blue Sky Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://blueskysantacruz.appfolio.com/listings", 6, False, False,
       "SLV page exists; 0 in 95006 at check", {"slug": "blueskysantacruz"}),
    _s("Santa Cruz Property Management Co.", "direct_page_reviewed", "custom_html", "custom_html",
       "https://santacruzproperty.com/rental_listings.cfm", 7, False, False, "ColdFusion; none in 95006 at check"),
    _s("Bailey Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://baileypm.com/long-term-rentals/ltr-search-new", 8, False, False, "JS widget; render check"),
    _s("Western Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://www.westernpropertymanagement.net/rental-availability", 8, False, False, "slug unconfirmed"),
    _s("Utopia Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://utopiamanagement.com/rental-list/santa-cruz-ca", 9, False, False, "BC page redirects to SC list"),
    _s("PowerWest Properties", "direct_page_reviewed", "appfolio", "appfolio",
       "https://www.powerwestrentals.com/rental_listings", 9, False, False, "0/0 at check"),
    # --- Excluded (do not serve 95006 long-term) ---
    _s("Kendall & Potter", "disabled", "appfolio", "appfolio",
       "https://montereycoast.com/rentals-appfolio/", 20, False, False, "enumerated zips exclude 95006"),
    _s("Cheshire Rio Realty", "disabled", "custom_html", "custom_html",
       "https://cheshirerio.com/", 20, False, False, "Escapia vacation rentals, not long-term"),
    # --- Aggregators (discovery-only, link out) ---
    _s("Zillow (95006)", "discovery_only", "discovery", "discovery",
       "https://www.zillow.com/boulder-creek-ca-95006/rentals/", 30, False, False),
    _s("Apartments.com (Boulder Creek)", "discovery_only", "discovery", "discovery",
       "https://www.apartments.com/boulder-creek-ca/", 30, False, False),
    _s("AffordableHousing.com (95006)", "discovery_only", "discovery", "discovery",
       "https://www.affordablehousing.com/boulder-creek-ca/", 30, False, False, "income-restricted"),
]

validate_registry(RENTAL_SOURCES)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_rentals_sources.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -q`
Expected: PASS (plan 1 + plan 2 tests, all green).

- [ ] **Step 6: Commit**

```bash
git add rentals/__init__.py rentals/sources.py tests/test_rentals_sources.py
git commit -m "feat(registry): verified rentals source registry (95006)"
```

---

## Self-Review Notes

- **Schema + gate:** Task 1. The onboarding gate (enabled ⇒ terms_ok ∧ not discovery/disabled; discovery_only ⇒ not enabled) is enforced in `_check` and tested.
- **Jobs registry (spec 5.2):** Task 2 — gov (JobAps/NEOGOV/CalOpps/custom), EDJOIN, healthcare (iCIMS/Taleo/Phenom), employers (Dayforce/Workday/Paycom/Paylocity/ADP/Oracle/iCIMS), local boards, remote feeds, discovery-only. Structured public sources enabled; render/terms-pending ones disabled honestly.
- **Rentals registry (spec 6.2):** Task 3 — confirmed 95006 PMs enabled (AppFolio/RentVine/custom), rotating ones disabled, excluded PMs disabled, aggregators discovery-only.
- **Parser families referenced** (neogov, edjoin, jobaps, calopps, workday, icims, dayforce, paycom, paylocity, adp, oracle, phenom, taleo, peoplesoft, rss, remote_json, appfolio, rentvine, custom_html, discovery) all exist in `KNOWN_PARSERS` — validation would reject a typo. The parser functions themselves are built in plans 3-4; here `parser` is only a validated tag.
- **Placeholder scan:** none — full registry data and validation code included.
- **Owner-decision flags** (Google Santa Cruz keep/drop; final top-25) are encoded as `enabled=False` with a note, so nothing acts on them until the owner confirms — surfaced to the owner separately, not blocking this plan.
