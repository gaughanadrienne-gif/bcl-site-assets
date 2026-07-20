import json

from shared.bcl_ingest import load_manual_entries

TODAY = "2026-07-19"


def _write(tmp_path, entries):
    p = tmp_path / "manual.json"
    p.write_text(json.dumps({"entries": entries}), encoding="utf-8")
    return str(p)


def test_returns_only_fresh_entry(tmp_path):
    fresh = {"title": "Fresh", "submitted_at": "2026-07-19", "renewed_at": None}
    expired = {"title": "Expired", "submitted_at": "2026-06-09", "renewed_at": None}  # 40 days before TODAY
    path = _write(tmp_path, [fresh, expired])
    out = load_manual_entries(path, TODAY, 30)
    assert [e["title"] for e in out] == ["Fresh"]


def test_renewed_at_within_ttl_revives_old_submitted_at(tmp_path):
    entry = {"title": "Renewed", "submitted_at": "2026-01-01", "renewed_at": "2026-07-18"}
    path = _write(tmp_path, [entry])
    out = load_manual_entries(path, TODAY, 30)
    assert [e["title"] for e in out] == ["Renewed"]


def test_missing_file_returns_empty_list(tmp_path):
    path = str(tmp_path / "nope.json")
    assert load_manual_entries(path, TODAY, 30) == []


def test_malformed_entry_without_date_is_skipped_not_raised(tmp_path):
    good = {"title": "Good", "submitted_at": "2026-07-19", "renewed_at": None}
    bad = {"title": "Bad"}  # no submitted_at / renewed_at at all
    path = _write(tmp_path, [good, bad])
    out = load_manual_entries(path, TODAY, 30)
    assert [e["title"] for e in out] == ["Good"]


def test_entry_exactly_at_ttl_boundary_is_included(tmp_path):
    entry = {"title": "Boundary", "submitted_at": "2026-06-19", "renewed_at": None}  # exactly 30 days before
    path = _write(tmp_path, [entry])
    out = load_manual_entries(path, TODAY, 30)
    assert [e["title"] for e in out] == ["Boundary"]
