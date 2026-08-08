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

def test_trailing_stipend_is_not_the_floor():
    # The most common real defect: SLVUSD teacher postings append a Masters
    # Stipend, which was being reported as the bottom of the pay range.
    r = parse_salary("$58,520 - $97,574 + $2,142 Masters Stipend")
    assert r["min"] == 58520 and r["max"] == 97574

def test_retirement_plan_is_not_pay():
    r = parse_salary("Competitive salary, 401(k), medical")
    assert r["disclosed"] is False and r["min"] is None

def test_benefit_number_does_not_become_the_ceiling():
    r = parse_salary("$22.00 - $28.00 per hour, plus 401k match")
    assert r["min"] == 22 and r["max"] == 28 and r["period"] == "hour"

def test_requisition_number_ignored():
    r = parse_salary("$65,000 - $80,000 per year (Req 12345)")
    assert r["min"] == 65000 and r["max"] == 80000

def test_pay_scale_label_ignored():
    r = parse_salary("Range 34: $26.85-$29.60 per hour (steps 1-3 of a 6 step scale)")
    assert r["min"] == 26.85 and r["max"] == 29.60

def test_years_of_service_ignored():
    r = parse_salary("$53,808-$95,375 + Master's Stipend $1,900 (up to 17 years)")
    assert r["min"] == 53808 and r["max"] == 95375

def test_percentage_stipend_ignored():
    r = parse_salary("$19.77 - $22.93 per hour + 2.5% stipend if Spanish Bilingual")
    assert r["min"] == 19.77 and r["max"] == 22.93

def test_discrete_rates_span_the_dollar_marked_amounts():
    # Not a range: two separate rates. The bare "1" in "1 year+" must not win.
    r = parse_salary("Full day pay rate= $170 for new substitute/$216 for 1 year+")
    assert r["min"] == 170 and r["max"] == 216

def test_unmarked_range_still_parses():
    # Many feeds here omit the dollar sign entirely; that is real disclosed pay.
    r = parse_salary("20.00 - 22.04 Per Hour")
    assert r["min"] == 20 and r["max"] == 22.04 and r["period"] == "hour"

def test_daily_rate_not_confused_by_hours_in_text():
    r = parse_salary("$700/Day - Day is 8 hours Daily")
    assert r["min"] == 700 and r["max"] == 700

def test_freshness():
    assert freshness_label("2026-07-18", "2026-07-19") == "New"
    assert freshness_label("2026-07-13", "2026-07-19") == "Recent"
    assert freshness_label("2026-06-01", "2026-07-19") == ""
