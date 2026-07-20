import json

from scripts.promote_submissions import main, promote

TODAY = "2026-07-19"


def test_promote_returns_only_approved_ids_stamped_with_today():
    # Real shape: refresh_jobs.py writes NORMALIZED items to
    # review/jobs-pending.json (employer_name/canonical_url/...), never raw
    # employer/url keys.
    pending = [
        {"id": "a1", "title": "Line Cook", "employer_name": "Diner",
         "city": "Boulder Creek", "canonical_url": "https://example.com/j/1",
         "geography_tier": "core"},
        {"id": "a2", "title": "Cashier", "employer_name": "Corner Store",
         "city": "Ben Lomond", "canonical_url": "https://example.com/j/2",
         "geography_tier": "core"},
    ]
    approved_ids = {"a1"}
    out = promote(pending, approved_ids, TODAY, "jobs")
    assert len(out) == 1
    assert out[0]["title"] == "Line Cook"
    # promote() must reverse-map normalized -> raw manual-entry shape.
    assert out[0]["employer"] == "Diner"
    assert out[0]["url"] == "https://example.com/j/1"
    assert out[0]["submitted_at"] == TODAY
    assert out[0]["renewed_at"] is None


def test_promote_ignores_id_not_in_pending():
    pending = [
        {"id": "a1", "title": "Line Cook", "employer_name": "Diner",
         "canonical_url": "https://example.com/j/1"},
    ]
    approved_ids = {"a1", "does-not-exist"}
    out = promote(pending, approved_ids, TODAY, "jobs")
    assert len(out) == 1
    assert out[0]["title"] == "Line Cook"


def test_promote_empty_approved_returns_empty():
    pending = [{"id": "a1", "title": "Line Cook", "employer_name": "Diner"}]
    assert promote(pending, set(), TODAY, "jobs") == []


def test_promote_reverse_maps_rental_fields():
    pending = [
        {"id": "r1", "headline": "Cozy Cabin", "address_public": "123 Pine St",
         "city": "Boulder Creek", "postal_code": "95006", "monthly_rent": 2200,
         "bedrooms": 2, "canonical_url": "https://example.com/rentals/cozy-cabin",
         "description_summary": "Nice place."},
    ]
    out = promote(pending, {"r1"}, TODAY, "rentals")
    assert len(out) == 1
    assert out[0]["headline"] == "Cozy Cabin"
    assert out[0]["url"] == "https://example.com/rentals/cozy-cabin"
    assert out[0]["description"] == "Nice place."
    assert out[0]["submitted_at"] == TODAY


def test_main_appends_to_manual_partial_and_dedups_by_id(tmp_path, monkeypatch):
    review_dir = tmp_path / "review"
    partials_dir = tmp_path / "partials"
    review_dir.mkdir()
    partials_dir.mkdir()

    pending_path = review_dir / "jobs-pending.json"
    approved_path = review_dir / "jobs-approved.txt"
    manual_path = partials_dir / "manual-jobs.json"

    # Real shape: NORMALIZED items, as refresh_jobs.py actually writes them.
    pending_path.write_text(json.dumps([
        {"id": "a1", "title": "Line Cook", "employer_name": "Diner",
         "city": "Boulder Creek", "canonical_url": "https://example.com/j/1",
         "geography_tier": "core"},
    ]), encoding="utf-8")
    approved_path.write_text("a1\n", encoding="utf-8")
    manual_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    import scripts.promote_submissions as mod
    monkeypatch.setattr(mod, "REVIEW_DIR", str(review_dir))
    monkeypatch.setattr(mod, "PARTIALS_DIR", str(partials_dir))

    main("jobs", TODAY)

    data = json.loads(manual_path.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    entry = data["entries"][0]
    assert entry["title"] == "Line Cook"
    assert entry["submitted_at"] == TODAY
    # The promoted manual entry must come out in RAW shape (the shape
    # normalize_job() re-reads), not the normalized pending shape.
    assert entry.get("employer") == "Diner"
    assert entry.get("url") == "https://example.com/j/1"

    # Re-running with the same approval must not duplicate (dedup by id).
    main("jobs", TODAY)
    data2 = json.loads(manual_path.read_text(encoding="utf-8"))
    assert len(data2["entries"]) == 1
