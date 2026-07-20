import os

from jobs.parsers import calopps, dayforce, paycom, paylocity

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(_FIXTURES, name), encoding="utf-8") as fh:
        return fh.read()


def test_dayforce_local_cities():
    rows = dayforce.parse(_read("dayforce_newleaf.md"), {"name": "New Leaf Community Markets"})
    assert len(rows) >= 5
    assert all(r["title"] and r["url"] for r in rows)
    cities = {r["city"] for r in rows}
    assert {"Santa Cruz", "Aptos", "Capitola"} <= cities
    # Half Moon Bay is out-of-area; the parser still extracts it (geo gate drops it later)
    assert "Half Moon Bay" in cities
    sushi = next(r for r in rows if r["url"].endswith("/jobs/27013"))
    assert sushi["city"] == "Santa Cruz"
    assert sushi["date_posted"] == "2026-07-17"


def test_paycom_local_city_and_hot_job_stripped():
    rows = paycom.parse(_read("paycom_communitybridges.md"), {"name": "Community Bridges"})
    assert len(rows) >= 5
    assert all("hot job" not in r["title"].lower() for r in rows)
    row = next(r for r in rows if r["url"].endswith("/jobs/163019"))
    assert row["title"] == "Program Assistant II (On call)"
    assert row["city"] == "Watsonville"
    assert row["hours_text"] == "On-Call"


def test_paylocity_single_site_empty_city():
    rows = paylocity.parse(_read("paylocity_dreaminn.md"), {"name": "Dream Inn Santa Cruz"})
    assert len(rows) == 1
    row = rows[0]
    assert row["title"] == "Front Desk Agent"
    assert row["url"] == "https://recruiting.paylocity.com/Recruiting/Jobs/Details/4225106"
    assert row["city"] == ""
    assert row["date_posted"] == "2026-07-13"


def test_calopps_firefighter_row():
    rows = calopps.parse(_read("calopps_centralfire.md"), {"name": "Central Fire District"})
    assert len(rows) == 1
    row = rows[0]
    assert row["title"] == "Paid Call Firefighter"
    assert row["category"] == "Fire"
    assert row["application_deadline"] == "09/30/2026"
    assert row["city"] == ""
    assert row["url"] == "https://www.calopps.org/central-fire-district-of-santa-cruz-county/job-20759270"
