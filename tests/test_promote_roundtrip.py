"""End-to-end: a NORMALIZED queued item (as refresh_*.py writes it to
review/<tool>-pending.json) -> promote() -> written to a manual partial ->
load_manual_entries() -> normalize_job/normalize_rental() -> include_*() ->
must publish, not fall into "missing-fields" or lose the submitter's data.

This is the regression test for FIX I2: promote() must reverse-map
normalized pending items back to the RAW shape normalize_job/normalize_rental
expect, or board-approved submissions silently never publish.
"""

from shared.bcl_ingest import load_manual_entries, write_json_atomic
from scripts.promote_submissions import promote
from jobs.normalize import include_job, normalize_job
from rentals.normalize import include_rental, normalize_rental

TODAY = "2026-07-19"

_MANUAL_SOURCE = {"name": "Community submission"}


def test_promote_job_roundtrip_publishes(tmp_path):
    pending_job = {
        "id": "job1",
        "title": "Line Cook",
        "employer_name": "Boulder Creek Diner",
        "city": "Boulder Creek",
        "canonical_url": "https://example.com/apply",
        "geography_tier": "core",
        "salary_text": "$20/hr",
        "description_summary": "Great kitchen job, flexible hours.",
        "posted_at": "2026-07-01",
        "work_mode": "on-site",
    }

    promoted = promote([pending_job], {"job1"}, TODAY, "jobs")

    manual_path = tmp_path / "manual-jobs.json"
    write_json_atomic(str(manual_path), {"entries": promoted})

    entries = load_manual_entries(str(manual_path), TODAY, 30)
    assert len(entries) == 1

    job = normalize_job(entries[0], _MANUAL_SOURCE, TODAY)
    ok, reason = include_job(job)

    assert ok is True, "expected publish, got reason=%r" % (reason,)
    assert job["employer_name"] == "Boulder Creek Diner"
    assert job["canonical_url"] == "https://example.com/apply"


def test_promote_rental_roundtrip_publishes(tmp_path):
    pending_rental = {
        "id": "rental1",
        "headline": "Cozy Cabin",
        "address_public": "123 Pine St",
        "city": "Boulder Creek",
        "postal_code": "95006",
        "monthly_rent": 2200,
        "bedrooms": 2,
        "canonical_url": "https://example.com/rentals/cozy-cabin",
        "description_summary": "Nice place, quiet street.",
    }

    promoted = promote([pending_rental], {"rental1"}, TODAY, "rentals")

    manual_path = tmp_path / "manual-rentals.json"
    write_json_atomic(str(manual_path), {"entries": promoted})

    entries = load_manual_entries(str(manual_path), TODAY, 14)
    assert len(entries) == 1

    rental = normalize_rental(entries[0], _MANUAL_SOURCE, TODAY)
    status, reason = include_rental(rental)

    assert status == "publish", "expected publish, got status=%r reason=%r" % (status, reason)
    assert rental["address_public"] == "123 Pine St"
    assert rental["canonical_url"] == "https://example.com/rentals/cozy-cabin"
