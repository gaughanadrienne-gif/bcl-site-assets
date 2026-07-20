import json

from jobs.refresh_jobs import build_jobs
from rentals.refresh_rentals import build_rentals

TODAY = "2026-07-19"


def _write_manual(tmp_path, name, entries):
    p = tmp_path / name
    p.write_text(json.dumps({"entries": entries}), encoding="utf-8")
    return str(p)


def _empty_job_fetchers():
    return {
        "http_get": lambda url, **kw: "",
        "http_json": lambda url, **kw: [],
        "firecrawl_markdown": lambda url, **kw: "",
    }


def _empty_rental_fetchers():
    return {"firecrawl_markdown": lambda url, **kw: ""}


def test_manual_job_in_core_city_publishes(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-jobs.json", [
        {
            "title": "Line Cook", "employer": "Boulder Creek Diner", "city": "Boulder Creek",
            "url": "https://example.com/jobs/line-cook", "salary_text": "$20/hr",
            "submitted_at": TODAY, "renewed_at": None,
        },
    ])
    published, queued = build_jobs([], _empty_job_fetchers(), TODAY, manual_path=manual_path)
    assert any(j["title"] == "Line Cook" for j in published)
    assert all(j.get("source") == "Community submission" for j in published)


def test_manual_job_in_unknown_city_queues(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-jobs.json", [
        {
            "title": "Remote-ish Helper", "employer": "Somewhere Inc", "city": "Nowhereville",
            "url": "https://example.com/jobs/helper",
            "submitted_at": TODAY, "renewed_at": None,
        },
    ])
    published, queued = build_jobs([], _empty_job_fetchers(), TODAY, manual_path=manual_path)
    assert not any(j["title"] == "Remote-ish Helper" for j in published)
    assert any(j["title"] == "Remote-ish Helper" for j in queued)
    hit = next(j for j in queued if j["title"] == "Remote-ish Helper")
    assert hit["_queue_reason"] == "ambiguous-location"


def test_expired_manual_job_does_not_appear(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-jobs.json", [
        {
            "title": "Stale Job", "employer": "Old Co", "city": "Boulder Creek",
            "url": "https://example.com/jobs/stale",
            "submitted_at": "2026-05-01", "renewed_at": None,  # well over 30 days before TODAY
        },
    ])
    published, queued = build_jobs([], _empty_job_fetchers(), TODAY, manual_path=manual_path)
    titles = [j["title"] for j in published] + [j["title"] for j in queued]
    assert "Stale Job" not in titles


def test_manual_rental_with_95006_publishes(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-rentals.json", [
        {
            "headline": "Cozy Cabin", "address_public": "123 Pine St", "city": "Boulder Creek",
            "postal_code": "95006", "monthly_rent": 2200, "bedrooms": 2,
            "url": "https://example.com/rentals/cozy-cabin",
            "submitted_at": TODAY, "renewed_at": None,
        },
    ])
    published, queued, had_errors = build_rentals(
        [], _empty_rental_fetchers(), TODAY, manual_path=manual_path,
    )
    assert had_errors is False
    assert any(r["headline"] == "Cozy Cabin" for r in published)
    assert all(r.get("source") == "Community submission" for r in published)


def test_manual_rental_without_95006_confirmation_queues(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-rentals.json", [
        {
            "headline": "Unverified Room", "city": "Boulder Creek",
            "monthly_rent": 1500, "bedrooms": 1,
            "url": "https://example.com/rentals/unverified-room",
            "submitted_at": TODAY, "renewed_at": None,
        },
    ])
    published, queued, had_errors = build_rentals(
        [], _empty_rental_fetchers(), TODAY, manual_path=manual_path,
    )
    assert not any(r["headline"] == "Unverified Room" for r in published)
    assert any(q["headline"] == "Unverified Room" for q in queued)


def test_expired_manual_rental_does_not_appear(tmp_path):
    manual_path = _write_manual(tmp_path, "manual-rentals.json", [
        {
            "headline": "Stale Rental", "city": "Boulder Creek", "postal_code": "95006",
            "monthly_rent": 1800, "bedrooms": 1,
            "url": "https://example.com/rentals/stale",
            "submitted_at": "2026-06-01", "renewed_at": None,  # well over 14 days before TODAY
        },
    ])
    published, queued, had_errors = build_rentals(
        [], _empty_rental_fetchers(), TODAY, manual_path=manual_path,
    )
    titles = [r["headline"] for r in published] + [r["headline"] for r in queued]
    assert "Stale Rental" not in titles
