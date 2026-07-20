"""Scam-indicator + fair-housing gate tests, pinned to concrete phrases."""

from rentals.safety import fair_housing_flags, safety_status, scam_flags


def _rental(**over):
    base = {"headline": "12895 Highway 9, Boulder Creek", "description": "", "monthly_rent": 3600}
    base.update(over)
    return base


def test_scam_flag_wire_before_viewing():
    rental = _rental(description="Please wire the deposit before viewing the property.")
    flags = scam_flags(rental)
    assert flags


def test_scam_flag_implausibly_low_rent():
    rental = _rental(monthly_rent=450, description="Great little cottage.")
    flags = scam_flags(rental)
    assert flags


def test_fair_housing_flag_no_children():
    rental = _rental(description="Quiet building, no children please.")
    flags = fair_housing_flags(rental)
    assert flags


def test_fair_housing_flag_no_section_8():
    rental = _rental(description="Sorry, no Section 8 vouchers accepted.")
    flags = fair_housing_flags(rental)
    assert flags


def test_clean_listing_is_ok():
    rental = _rental(description="Bright 2 bedroom home with a large yard, available now.")
    assert scam_flags(rental) == []
    assert fair_housing_flags(rental) == []
    ok, reasons = safety_status(rental)
    assert ok is True
    assert reasons == []


def test_scam_flag_zelle_payment():
    rental = _rental(description="Please pay deposit via zelle before move-in.")
    flags = scam_flags(rental)
    assert flags


def test_fair_housing_flag_protected_class_preference():
    rental = _rental(description="Christian household preferred, no exceptions.")
    flags = fair_housing_flags(rental)
    assert flags


def test_fair_housing_flag_no_service_animals():
    rental = _rental(description="No service animals allowed on the property.")
    flags = fair_housing_flags(rental)
    assert flags


def test_fair_housing_flag_no_vouchers():
    rental = _rental(description="Sorry, no vouchers accepted for this unit.")
    flags = fair_housing_flags(rental)
    assert flags


def test_fair_housing_flag_no_families():
    rental = _rental(description="Adult community, no families please.")
    flags = fair_housing_flags(rental)
    assert flags


def test_safety_status_combines_and_prefixes_reasons():
    rental = _rental(
        monthly_rent=450,
        description="Wire the deposit before viewing. No children allowed.",
    )
    ok, reasons = safety_status(rental)
    assert ok is False
    assert any(r.startswith("scam:") for r in reasons)
    assert any(r.startswith("fairhousing:") for r in reasons)
