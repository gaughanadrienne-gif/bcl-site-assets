import json

from scripts.promote_submissions import main, promote

TODAY = "2026-07-19"


def test_promote_returns_only_approved_ids_stamped_with_today():
    pending = [
        {"id": "a1", "title": "Line Cook", "city": "Boulder Creek"},
        {"id": "a2", "title": "Cashier", "city": "Ben Lomond"},
    ]
    approved_ids = {"a1"}
    out = promote(pending, approved_ids, TODAY)
    assert len(out) == 1
    assert out[0]["title"] == "Line Cook"
    assert out[0]["submitted_at"] == TODAY
    assert out[0]["renewed_at"] is None


def test_promote_ignores_id_not_in_pending():
    pending = [{"id": "a1", "title": "Line Cook"}]
    approved_ids = {"a1", "does-not-exist"}
    out = promote(pending, approved_ids, TODAY)
    assert len(out) == 1
    assert out[0]["title"] == "Line Cook"


def test_promote_empty_approved_returns_empty():
    pending = [{"id": "a1", "title": "Line Cook"}]
    assert promote(pending, set(), TODAY) == []


def test_main_appends_to_manual_partial_and_dedups_by_id(tmp_path, monkeypatch):
    review_dir = tmp_path / "review"
    partials_dir = tmp_path / "partials"
    review_dir.mkdir()
    partials_dir.mkdir()

    pending_path = review_dir / "jobs-pending.json"
    approved_path = review_dir / "jobs-approved.txt"
    manual_path = partials_dir / "manual-jobs.json"

    pending_path.write_text(json.dumps([
        {"id": "a1", "title": "Line Cook", "city": "Boulder Creek",
         "employer": "Diner", "url": "https://example.com/j/1"},
    ]), encoding="utf-8")
    approved_path.write_text("a1\n", encoding="utf-8")
    manual_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    import scripts.promote_submissions as mod
    monkeypatch.setattr(mod, "REVIEW_DIR", str(review_dir))
    monkeypatch.setattr(mod, "PARTIALS_DIR", str(partials_dir))

    main("jobs", TODAY)

    data = json.loads(manual_path.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    assert data["entries"][0]["title"] == "Line Cook"
    assert data["entries"][0]["submitted_at"] == TODAY

    # Re-running with the same approval must not duplicate (dedup by id).
    main("jobs", TODAY)
    data2 = json.loads(manual_path.read_text(encoding="utf-8"))
    assert len(data2["entries"]) == 1
