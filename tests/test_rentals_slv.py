"""Tests for the widened SLV include rule + town locality label."""

from rentals.normalize import include_rental, normalize_rental

TODAY = "2026-07-19"
SOURCE = {"name": "PMI Santa Cruz"}


def _raw(**over):
    base = {
        "headline": "12895 Highway 9, Boulder Creek",
        "address_public": "12895 Highway 9",
        "city": "Boulder Creek",
        "postal_code": "95006",
        "monthly_rent": "3600",
        "bedrooms": "2",
        "bathrooms": 1.5,
        "square_feet": "800",
        "available_date": "Immediately",
        "property_type": "Single Family Home",
        "url": "https://example.com/listing/1",
        "description": "",
        "undisclosed": False,
    }
    base.update(over)
    return base


def test_ben_lomond_95005_listing_publishes_with_locality():
    rental = normalize_rental(
        _raw(city="Ben Lomond", postal_code="95005", address_public="10510 Highway 9"),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "publish"
    assert reason is None
    assert rental["locality"] == "Ben Lomond"


def test_felton_95018_listing_publishes():
    rental = normalize_rental(
        _raw(city="Felton", postal_code="95018", address_public="120 Felton Empire Rd"),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "publish"
    assert rental["locality"] == "Felton"


def test_scotts_valley_95066_listing_is_rejected_not_slv():
    rental = normalize_rental(
        _raw(city="Scotts Valley", postal_code="95066", address_public="1 Vine Hill School Rd"),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "reject"
    assert reason == "not-slv"


def test_undisclosed_ben_lomond_listing_is_queued():
    rental = normalize_rental(
        _raw(city="Ben Lomond", address_public="", postal_code="", undisclosed=True),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "queue"
    assert reason == "undisclosed-slv-verify"


def test_boulder_creek_95006_listing_still_publishes():
    rental = normalize_rental(_raw(), SOURCE, TODAY)
    status, reason = include_rental(rental)
    assert status == "publish"
    assert rental["locality"] == "Boulder Creek"
