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
