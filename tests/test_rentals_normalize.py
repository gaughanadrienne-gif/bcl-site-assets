"""Normalize + inclusion tests, pinned to concrete values."""

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


def test_normalize_maps_rent_string_to_numeric():
    rental = normalize_rental(_raw(monthly_rent="$3,600/mo."), SOURCE, TODAY)
    assert rental["monthly_rent"] == 3600


def test_confirmed_95006_sfr_is_published():
    rental = normalize_rental(_raw(), SOURCE, TODAY)
    status, reason = include_rental(rental)
    assert status == "publish"
    assert reason is None
    assert rental["location_precision"] == "exact"
    assert rental["state"] == "CA"
    assert rental["property_manager"] == "PMI Santa Cruz"
    assert rental["verification_status"] == "verified"


def test_commercial_listing_is_rejected():
    rental = normalize_rental(_raw(property_type="Commercial"), SOURCE, TODAY)
    status, reason = include_rental(rental)
    assert status == "reject"


def test_undisclosed_boulder_creek_listing_is_queued():
    rental = normalize_rental(
        _raw(address_public="", postal_code="", undisclosed=True), SOURCE, TODAY
    )
    status, reason = include_rental(rental)
    assert status == "queue"
    assert reason == "undisclosed-95006-verify"


def test_ben_lomond_95005_listing_is_rejected():
    rental = normalize_rental(
        _raw(city="Ben Lomond", postal_code="95005", address_public="10510 Highway 9"),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "reject"


def test_room_listing_gets_private_room_scope():
    rental = normalize_rental(
        _raw(headline="Private room for rent, Boulder Creek"), SOURCE, TODAY
    )
    assert rental["rental_scope"] == "private-room"


def test_vacation_listing_is_rejected():
    rental = normalize_rental(
        _raw(property_type="Vacation Rental"), SOURCE, TODAY
    )
    status, reason = include_rental(rental)
    assert status == "reject"


def test_placeholder_zero_rent_no_beds_is_rejected():
    rental = normalize_rental(
        _raw(monthly_rent="0", bedrooms="", bathrooms="", headline="Online Rental Application"),
        SOURCE, TODAY,
    )
    status, reason = include_rental(rental)
    assert status == "reject"


def test_min_stay_under_30_is_rejected():
    rental = normalize_rental(_raw(), SOURCE, TODAY)
    rental["minimum_stay_days"] = 7
    status, reason = include_rental(rental)
    assert status == "reject"


def test_description_summary_derived_from_scrubbed_description():
    rental = normalize_rental(
        _raw(description="Enjoy this charming fully furnished 1-bedroom home near downtown."),
        SOURCE, TODAY,
    )
    assert "fully furnished" in rental["description_summary"].lower()


def test_furnished_true_when_description_says_furnished():
    rental = normalize_rental(
        _raw(description="This cozy studio comes fully furnished."), SOURCE, TODAY
    )
    assert rental["furnished"] is True


def test_furnished_false_when_description_says_unfurnished():
    rental = normalize_rental(
        _raw(description="This unfurnished unit is move-in ready."), SOURCE, TODAY
    )
    assert rental["furnished"] is False


def test_rental_scope_bedroom_in_headline_is_entire_not_private_room():
    rental = normalize_rental(_raw(headline="2 Bedroom House"), SOURCE, TODAY)
    assert rental["rental_scope"] == "entire"


def test_rental_scope_private_room_in_shared_house():
    rental = normalize_rental(
        _raw(headline="Private room in shared house"), SOURCE, TODAY
    )
    assert rental["rental_scope"] == "private-room"


def test_description_summary_scrubs_phone_and_email():
    rental = normalize_rental(
        _raw(description="Nice unit, call (831) 555-1234 or me@x.com for a tour."),
        SOURCE, TODAY,
    )
    assert "555-1234" not in rental["description_summary"]
    assert "me@x.com" not in rental["description_summary"]
