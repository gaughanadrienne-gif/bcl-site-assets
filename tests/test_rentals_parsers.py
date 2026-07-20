"""Parser tests pinned against real captured fixtures (ground truth)."""

from rentals.parsers import appfolio, custom_html, rentvine

RENTVINE_MD = open("tests/fixtures/rentvine_pmi.md", encoding="utf-8").read()
STREAMLINE_MD = open("tests/fixtures/streamline_rentals.md", encoding="utf-8").read()
APPFOLIO_MD = open("tests/fixtures/appfolio_populated.md", encoding="utf-8").read()
APPFOLIO_EMPTY_MD = open("tests/fixtures/appfolio_scottsvalley.md", encoding="utf-8").read()

SOURCE = {"name": "test-source", "url": "https://example.com/listings"}


def test_rentvine_parses_confirmed_boulder_creek_row():
    rows = rentvine.parse(RENTVINE_MD, SOURCE)
    assert len(rows) >= 1
    for row in rows:
        assert row["headline"]
        assert row["city"]

    bc_rows = [r for r in rows if r["postal_code"] == "95006"]
    assert len(bc_rows) == 1
    row = bc_rows[0]
    assert row["address_public"] == "12895 Highway 9"
    assert row["city"] == "Boulder Creek"
    assert row["monthly_rent"] == "3600"
    assert row["bedrooms"] == "2"
    assert row["bathrooms"] == 1.5
    assert row["square_feet"] == "800"
    assert row["property_type"] == "Single Family Home"
    assert row["available_date"] == "Immediately"
    assert row["undisclosed"] is False
    assert row["url"]


def test_streamline_parses_disclosed_and_undisclosed_boulder_creek_rows():
    rows = custom_html.parse(STREAMLINE_MD, SOURCE)
    assert len(rows) >= 1
    for row in rows:
        assert row["headline"]

    disclosed = [r for r in rows if r["postal_code"] == "95006" and not r["undisclosed"]]
    assert len(disclosed) == 1
    row = disclosed[0]
    assert row["address_public"] == "13350 Big Basin Way"
    assert row["city"] == "Boulder Creek"
    assert row["monthly_rent"] == "4450"
    assert row["property_type"] == "Commercial"

    undisclosed = [r for r in rows if r["undisclosed"]]
    assert len(undisclosed) == 1
    urow = undisclosed[0]
    assert urow["city"] == "Boulder Creek"
    assert urow["postal_code"] == ""
    assert urow["bedrooms"] == "5"
    assert urow["bathrooms"] == "3"
    assert urow["url"] == SOURCE["url"]


def test_appfolio_skips_zero_dollar_placeholder_card():
    rows = appfolio.parse(APPFOLIO_MD, SOURCE)
    assert len(rows) >= 1
    for row in rows:
        assert row["headline"]
        assert row["city"]
        assert not (not row["monthly_rent"] and not row["bedrooms"])
        assert row["monthly_rent"] != "0"

    assert not any("Online Rental Application" in r["headline"] for r in rows)


def test_appfolio_empty_state_returns_no_rows():
    rows = appfolio.parse(APPFOLIO_EMPTY_MD, SOURCE)
    assert rows == []


import re as _re

from rentals.normalize import normalize_rental

_EMAIL_RE = _re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = _re.compile(r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")


def test_appfolio_description_captures_real_fixture_phrase():
    rows = appfolio.parse(APPFOLIO_MD, SOURCE)
    descriptions = " ".join(r["description"] for r in rows)
    # 329 Dufour Street listing body genuinely says "fully furnished".
    assert "fully furnished" in descriptions.lower()


def test_appfolio_description_scrubs_pii():
    rows = appfolio.parse(APPFOLIO_MD, SOURCE)
    for row in rows:
        assert not _EMAIL_RE.search(row["description"])
        assert not _PHONE_RE.search(row["description"])


def test_no_pii_in_normalized_output_across_all_fixtures():
    today = "2026-07-19"
    raw_rows = (
        appfolio.parse(APPFOLIO_MD, SOURCE)
        + rentvine.parse(RENTVINE_MD, SOURCE)
        + custom_html.parse(STREAMLINE_MD, SOURCE)
    )
    assert raw_rows  # sanity: fixtures actually produced rows
    for raw in raw_rows:
        rental = normalize_rental(raw, SOURCE, today)
        blob = " ".join(str(v) for v in rental.values())
        assert not _EMAIL_RE.search(blob), blob
        assert not _PHONE_RE.search(blob), blob
