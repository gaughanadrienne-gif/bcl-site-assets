import json
import os

from jobs.parsers import workday

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "workday_foxfactory.json")


def _load():
    with open(_FIXTURE, encoding="utf-8") as fh:
        return json.load(fh)


def _source(today="2026-07-19"):
    return {
        "name": "Fox Factory",
        "config": {"host": "https://foxfactory.wd1.myworkdayjobs.com", "tenant": "foxfactory", "site": "FOX"},
        "_today": today,
    }


def test_parses_all_postings():
    rows = workday.parse(_load(), _source())
    assert len(rows) == 3
    assert all(r["title"] for r in rows)
    assert all(r["url"] for r in rows)


def test_non_ca_posting_has_empty_city_but_other_fields_still_parsed():
    # "US OK, Jenks" is a real Oklahoma posting, not CA -- per the geo-guard,
    # city must be blank (so it geo-queues) even though the rest of the row
    # parses normally.
    rows = workday.parse(_load(), _source())
    row = next(r for r in rows if r["location_text"] == "US OK, Jenks")
    assert row["city"] == ""
    assert row["url"] == (
        "https://foxfactory.wd1.myworkdayjobs.com/en-US/FOX"
        "/job/US-OK-Jenks/Hitter-s-House-Sales-Clerk---Oklahoma_JR112826"
    )
    assert row["date_posted"] == "2026-07-17"
    assert row["remote"] is False
    assert row["work_mode"] == "on-site"


def test_multi_location_posting_city_is_empty():
    rows = workday.parse(_load(), _source())
    row = next(r for r in rows if r["location_text"] == "3 Locations")
    assert row["city"] == ""


def test_non_ca_state_token_yields_empty_city():
    # "US UT, Santa Clara" -- same city name as a Bay Area CA city, but the
    # state token is UT. Must not be accepted as a CA city.
    assert workday._city_from_locations_text("US UT, Santa Clara") == ""


def test_ca_state_token_yields_city():
    assert workday._city_from_locations_text("US CA, Scotts Valley") == "Scotts Valley"
