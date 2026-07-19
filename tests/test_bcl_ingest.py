def test_package_imports():
    import shared.bcl_ingest  # noqa: F401


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
