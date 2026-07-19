from jobs.parsers import neogov, jobaps, edjoin
from jobs.sources import JOB_SOURCES

NEOGOV_SRC = next(s for s in JOB_SOURCES if s["name"] == "City of Scotts Valley")
JOBAPS_SRC = next(s for s in JOB_SOURCES if s["name"] == "County of Santa Cruz")
EDJOIN_SRC = next(s for s in JOB_SOURCES if s["name"] == "SLVUSD (EDJOIN)")


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


def test_edjoin_parses_repeating_blocks():
    md = open("tests/fixtures/edjoin_slvusd.md", encoding="utf-8").read()
    rows = edjoin.parse(md, EDJOIN_SRC)
    assert rows
    for r in rows:
        assert r["title"] and r["url"]
        assert r["work_mode"] == "on-site" and r["remote"] is False
    ia_pool = next(r for r in rows if "Instructional Assistant Substitute Pool" in r["title"])
    assert ia_pool["employer"] == "San Lorenzo Valley Unified"
    assert ia_pool["city"] == "Ben Lomond"
    assert ia_pool["salary_text"] == "$19.94 Per Hour"
