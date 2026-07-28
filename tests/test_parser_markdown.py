import json
from jobs.parsers import neogov, jobaps, edjoin
from jobs.sources import JOB_SOURCES

NEOGOV_SRC = next(s for s in JOB_SOURCES if s["name"] == "City of Scotts Valley")
JOBAPS_SRC = next(s for s in JOB_SOURCES if s["name"] == "County of Santa Cruz")
EDJOIN_SRC = next(s for s in JOB_SOURCES if s["parser"] == "edjoin")


def test_neogov_parses_table_with_zip():
    md = open("tests/fixtures/neogov_scottsvalley.md", encoding="utf-8").read()
    rows = neogov.parse(md, NEOGOV_SRC)
    assert rows
    for r in rows:
        assert r["title"] and r["url"]
        assert r["work_mode"] == "on-site" and r["remote"] is False
    assert any(r.get("postal_code") == "95066" for r in rows)
    chief = next(r for r in rows if r["title"] == "Chief Plant Operator")
    assert chief["salary_text"] == "$101,976.00 - $136,644.00 Annually"
    assert chief["employer"] == "Public Works Dept"
    assert chief["hours_text"] == "Full-Time"
    assert chief["date_posted"] == "2026-05-12"


def test_jobaps_parses_repeating_blocks():
    md = open("tests/fixtures/jobaps_scruz.md", encoding="utf-8").read()
    rows = jobaps.parse(md, JOBAPS_SRC)
    assert rows
    for r in rows:
        assert r["title"] and r["url"]
        assert r["city"] == "Santa Cruz"
        assert r["work_mode"] == "on-site" and r["remote"] is False
    attorney = next(r for r in rows if "ATTORNEY I" in r["title"])
    assert attorney["employer"] == "District Attorney"
    assert attorney["salary_text"] == "$9,396 - 11,431 / Month"
    assert attorney["application_deadline"] == "Continuous"


def test_edjoin_parses_the_json_endpoint():
    """EDJOIN moved to client-side rendering, so the parser reads its own JSON
    endpoint now. The old markdown path returned an empty list forever, which
    is not an error, which is how six districts went unnoticed."""
    payload = json.load(open("tests/fixtures/edjoin_sccounty.json", encoding="utf-8"))
    rows = edjoin.parse(payload, EDJOIN_SRC)
    assert rows
    for r in rows:
        assert r["title"] and r["url"].startswith("https://www.edjoin.org/Home/JobPosting/")
        assert r["work_mode"] == "on-site" and r["remote"] is False
    slv = next(r for r in rows if "San Lorenzo" in r["employer"])
    assert slv["city"] == "Ben Lomond"
    assert slv["date_posted"].startswith("20")          # .NET /Date(ms)/ decoded
    assert "$" in slv["salary_text"]


def test_edjoin_never_invents_a_salary_or_a_date():
    """A row with no pay published must yield an empty string, not a guess, and
    EDJOIN's DateTime.MinValue sentinel must not become a real date."""
    payload = {"data": [{
        "positionTitle": "Substitute Teacher", "postingID": 999, "districtName": "Test USD",
        "city": "Felton", "countyName": "Santa Cruz",
        "postingDate": "/Date(-62135568000000)/",     # sentinel = not set
        "PayRangeFrom": "", "PayRangeTo": "", "SingleRate": "", "salaryInfo": "",
        "displayFlag": "Until Filled",
    }]}
    r = edjoin.parse(payload, EDJOIN_SRC)[0]
    assert r["salary_text"] == ""
    assert r["date_posted"] == ""
    assert r["application_deadline"] == "Until Filled"


def test_edjoin_skips_rows_it_cannot_link_to():
    payload = {"data": [
        {"positionTitle": "No id here", "districtName": "Test USD"},
        {"postingID": 1, "districtName": "Test USD"},
        {"positionTitle": "Good", "postingID": 2, "districtName": "Test USD"},
    ]}
    rows = edjoin.parse(payload, EDJOIN_SRC)
    assert [r["title"] for r in rows] == ["Good"]


def test_edjoin_tolerates_a_junk_payload():
    """A shape change upstream must return nothing, not raise: one broken
    source may never abort the whole refresh."""
    assert edjoin.parse("<html>notice page</html>", EDJOIN_SRC) == []
    assert edjoin.parse({"unexpected": 1}, EDJOIN_SRC) == []
    assert edjoin.parse(None, EDJOIN_SRC) == []
