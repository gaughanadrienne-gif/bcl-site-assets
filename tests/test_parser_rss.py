from jobs.parsers import rss
from jobs.sources import JOB_SOURCES

WWR = next(s for s in JOB_SOURCES if s["name"] == "We Work Remotely (remote)")
SH = next(s for s in JOB_SOURCES if s["name"] == "Second Harvest (RSS)")


def test_wwr_splits_company_and_title():
    xml = open("tests/fixtures/wwr_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, {**WWR, "config": {"style": "wwr"}})
    assert rows and all(r["remote"] is True for r in rows)
    assert all(r["title"] and r["employer"] and r["url"] for r in rows)
    # Pin a real value from the fixture.
    lawnstarter = next(r for r in rows if r["employer"] == "LawnStarter")
    assert lawnstarter["title"] == "Data Governance & Platform Manager"


def test_secondharvest_extracts_location_and_employer():
    xml = open("tests/fixtures/secondharvest_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, {**SH, "config": {"style": "employer", "employer": "Second Harvest Food Bank Santa Cruz County"}})
    assert rows
    for r in rows:
        assert r["employer"] == "Second Harvest Food Bank Santa Cruz County"
        assert r["remote"] is False
        assert r["title"] and r["url"]
    chief = next(r for r in rows if "Chief of Staff" in r["title"])
    assert chief["city"] == "Watsonville"
    assert "178,263" in chief["salary_text"]
