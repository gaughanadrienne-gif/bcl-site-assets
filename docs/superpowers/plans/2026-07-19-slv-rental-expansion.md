# San Lorenzo Valley Rental Expansion — Implementation Plan (Plan 4b, rentals follow-up)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Widen the rentals tool from strict Boulder-Creek-95006 to the whole San Lorenzo Valley — Ben Lomond (95005), Boulder Creek (95006), Brookdale (95007), Felton (95018) — with every listing labeled by town, a town filter on the board, more property managers enabled, and updated copy. This immediately publishes the valley listings our existing sources already carry but were rejecting, and grows coverage.

**Architecture:** Same rentals pipeline. Replace the `is_95006` publish gate with an `is_slv` gate + a `slv_locality` town resolver; normalize sets a `locality` (town); the renderer shows a town badge + town filter; the registry enables another valley property manager. All existing safety rules (scam, fair-housing, exclusions, guard, no-PII) are unchanged and still apply.

**Tech Stack:** Python 3.9+ stdlib + pytest (pipeline); ES5 (widget). Depends on plans 1-4.

## Global Constraints

- Working dir: repo root. Branch: create `feature/slv-rentals` off `main` (main now has everything). Do not push until reviewed.
- **SLV scope = ZIPs 95005 / 95006 / 95007 / 95018 only.** Reject anything else (Scotts Valley 95066, Santa Cruz 95060/62, Watsonville 95076, etc.) — zero tolerance for out-of-valley, same discipline as the old 95006 rule, just a wider set.
- **All existing safety rules unchanged:** commercial/vacation/for-sale/placeholder exclusions, scam + fair-housing → queue, tiny-inventory guard, no PII. A verified-PM listing in an SLV town with an undisclosed address → queue (`undisclosed-slv-verify`), never auto-published.
- Keep `is_95006` in `shared/bcl_ingest.py` (other code/tests use it); ADD `is_slv` alongside it.
- Commit after each task with the standard trailers.

## SLV localities

| Town | ZIP |
|---|---|
| Ben Lomond | 95005 |
| Boulder Creek | 95006 |
| Brookdale | 95007 |
| Felton | 95018 |

---

## Task 1: SLV gate + town resolver

**Files:** Modify `shared/bcl_ingest.py`; Test `tests/test_slv_geo.py`

**Interfaces — Produces:**
- `SLV_ZIPS` (frozenset {"95005","95006","95007","95018"}) and `SLV_TOWNS` (dict ZIP→town).
- `is_slv(rec) -> bool` — True when `postal_code` is an SLV ZIP, or an SLV ZIP appears in `address_public`/`address_normalized`. A bare town name with no ZIP is NOT sufficient (mirrors the old 95006 rule).
- `slv_locality(rec) -> str` — the town name from the record's SLV ZIP (postal_code first, then an SLV ZIP found in an address field); else if `city` case-insensitively matches an SLV town, that town; else "".

- [ ] **Step 1: Write failing tests** — `tests/test_slv_geo.py`:

```python
from shared.bcl_ingest import is_slv, slv_locality


def test_is_slv_by_zip():
    assert is_slv({"postal_code": "95005"}) is True   # Ben Lomond
    assert is_slv({"postal_code": "95018"}) is True   # Felton
    assert is_slv({"address_public": "123 X St, Brookdale, CA 95007"}) is True

def test_is_slv_rejects_outside():
    assert is_slv({"postal_code": "95066"}) is False  # Scotts Valley
    assert is_slv({"postal_code": "95060"}) is False  # Santa Cruz

def test_is_slv_city_alone_insufficient():
    assert is_slv({"city": "Ben Lomond"}) is False

def test_slv_locality_from_zip():
    assert slv_locality({"postal_code": "95005"}) == "Ben Lomond"
    assert slv_locality({"postal_code": "95006"}) == "Boulder Creek"
    assert slv_locality({"address_public": "X, Felton, CA 95018"}) == "Felton"

def test_slv_locality_from_city_when_no_zip():
    assert slv_locality({"city": "brookdale"}) == "Brookdale"
    assert slv_locality({"city": "Santa Cruz"}) == ""
```

- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement** in `shared/bcl_ingest.py` (reuse the `_ZIP` idea; SLV_TOWNS = {"95005":"Ben Lomond","95006":"Boulder Creek","95007":"Brookdale","95018":"Felton"}). **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(rentals): SLV geo gate + town resolver`.

---

## Task 2: rentals normalize + include + registry to SLV

**Files:** Modify `rentals/normalize.py`, `rentals/sources.py`; Test `tests/test_rentals_slv.py`, update `tests/test_rentals_normalize.py`

**Interfaces — Changes:**
- `normalize_rental` sets `locality = slv_locality(...)` (town) on the output record (add the key to the public schema).
- `include_rental` uses `is_slv` instead of `is_95006`: `is_slv` → "publish"; else if `slv_locality` resolves a town from city (undisclosed, no ZIP) → "queue", reason "undisclosed-slv-verify"; else "reject" (reason "not-slv").
- `rentals/sources.py`: enable **Blue Sky Property Management** (AppFolio, slug `blueskysantacruz`, parser already built) — set `enabled=True, terms_ok=True`. Update the 3 existing enabled sources' notes to "SLV-wide". Leave Bailey/Western/Utopia/PowerWest/Santa Cruz Property Mgmt disabled (slug/parser unverified) with a "SLV follow-up" note.

- [ ] **Step 1: Write failing tests** — `tests/test_rentals_slv.py`: a Ben Lomond 95005 rental → include "publish", locality "Ben Lomond"; a Felton 95018 rental → publish; a Scotts Valley 95066 rental → reject "not-slv"; an undisclosed-address rental whose city is "Ben Lomond" → queue "undisclosed-slv-verify"; a Boulder Creek 95006 rental still publishes (regression). Also update any test in `test_rentals_normalize.py` that asserted the old 95006-only reject on a 95005 listing.
- [ ] **Step 2: Run — expect FAIL.** **Step 3: Implement.** **Step 4: Run — expect PASS + full suite green.** **Step 5: Commit** `feat(rentals): widen include to SLV + town label + enable Blue Sky`.

---

## Task 3: rendering — town badge, town filter, copy

**Files:** Modify `tools/bcl-tools.js`; Test `tools/tests/rentals-render.test.js`

**Interfaces — Changes:**
- `rentalCard`: the badge shows `rental.locality` (town) when set, else the postal_code; keep it styled as `.bcl-badge`.
- `filterRentals`: add a `town` option (`opts.town`) that keeps rentals whose `locality` matches (empty/"all" = all towns).
- `initRentals`: add a town `<select>` (All towns / Boulder Creek / Ben Lomond / Felton / Brookdale) wired to `render()`; change the count line and empty-state copy from "95006 rentals" to "San Lorenzo Valley rentals"; keep the scam-safety + fair-housing disclaimer, and update the "95006" scope wording in it to "the San Lorenzo Valley (Boulder Creek, Ben Lomond, Felton, Brookdale)". Add a small link-out line under the board: "Looking further? See more valley rentals on Zillow" → `https://www.zillow.com/boulder-creek-ca/rentals/` (rel="noopener").

- [ ] **Step 1: Write failing tests** — update `tools/tests/rentals-render.test.js`: `rentalCard` shows the town (e.g. "Ben Lomond") when `locality` set; `filterRentals` with `town:"Felton"` returns only Felton rentals; keep the existing "no undefined" + verified-only assertions.
- [ ] **Step 2: Run — expect FAIL.** (`node --test tools/tests/rentals-render.test.js`) **Step 3: Implement** (ES5 only). **Step 4: Run — expect PASS** + `node --test tools/tests/` (no regression) + `python -m pytest -q`. **Step 5: Commit** `feat(render): SLV town badge + town filter + copy`.

---

## Task 4: live smoke + deploy notes

- [ ] **Step 1: Live smoke:** `python rentals/refresh_rentals.py`; report the new `data/rentals.json` count + the town breakdown (expect more than 1 now: Boulder Creek + Ben Lomond/Brookdale from Streamline/PMI + any Blue Sky SLV inventory). Do NOT commit data or push (the controller handles deploy after review).
- [ ] **Step 2:** Note in the report anything that looks off (a source erroring, a town mislabeled) for the controller's review.

---

## Self-Review Notes

- **SLV gate (owner decision):** Task 1 `is_slv` (95005/06/07/18), zero out-of-valley tolerance preserved.
- **Town labels + filter (spec 6.4-style):** Task 2 `locality` + Task 3 badge/filter.
- **More sources:** Task 2 enables Blue Sky (built AppFolio parser); the widened gate also releases the Ben Lomond/Brookdale listings the 3 existing sources already carry.
- **Safety unchanged:** exclusions, scam, fair-housing, guard, no-PII all untouched; undisclosed-SLV still queues.
- **Aggregators still link-out** (Zillow), never scraped — Task 3 adds the "see more" link.
- **Deferred:** Bailey/Western/Utopia/PowerWest/Santa Cruz Property Mgmt (unverified slug/parser); MLS/RESO feed for true aggregator inventory.
