from rentals.sources import RENTAL_SOURCES
from shared.registry import validate_registry


def test_registry_validates():
    assert validate_registry(RENTAL_SOURCES) is RENTAL_SOURCES

def test_all_rentals_tool():
    assert all(s["tool"] == "rentals" for s in RENTAL_SOURCES)

def test_confirmed_slv_managers_enabled():
    by_name = {s["name"]: s for s in RENTAL_SOURCES}
    for name in ("Scotts Valley Property Management", "PMI Santa Cruz", "C&C Property Management",
                 "Utopia Management", "Santa Cruz Property Management Co.", "Sol Property Management"):
        assert by_name[name]["enabled"] is True, name


def test_scotts_valley_pm_uses_its_own_site_table_not_the_empty_appfolio_portal():
    s = next(x for x in RENTAL_SOURCES if x["name"] == "Scotts Valley Property Management")
    assert s["url"] == "https://www.scottsvalleyproperty.com/available_rentals"
    assert s["parser"] == "markdown_table"


def test_new_sources_use_verified_urls_and_parsers():
    by_name = {s["name"]: s for s in RENTAL_SOURCES}
    assert (by_name["C&C Property Management"]["url"], by_name["C&C Property Management"]["parser"]) == (
        "https://ccpmgmt.appfolio.com/listings", "appfolio")
    assert (by_name["Santa Cruz Property Management Co."]["parser"]) == "coldfusion_cards"
    sol = by_name["Sol Property Management"]
    assert (sol["url"], sol["parser"], sol["platform"]) == (
        "https://solpropertymanagement.managebuilding.com/Resident/public/rentals", "buildium", "buildium")
    utopia = by_name["Utopia Management"]
    assert utopia["url"] == "https://utopiamanagement.appfolio.com/listings"
    assert utopia["parser"] == "appfolio"
    assert utopia["config"]["page_url_template"].format(n=2) == (
        "https://utopiamanagement.appfolio.com/listings/listings?page=2")
    assert utopia["config"]["max_pages"] == 5


def test_every_enabled_source_has_a_runnable_parser():
    from rentals.refresh_rentals import PARSERS
    for s in RENTAL_SOURCES:
        if s["enabled"]:
            assert s["parser"] in PARSERS, s["name"]


def test_sources_without_slv_inventory_are_disabled():
    by_name = {s["name"]: s for s in RENTAL_SOURCES}
    for name in ("PowerWest Properties", "Streamline 831", "Western Property Management",
                 "Pelican Property Management"):
        assert by_name[name]["enabled"] is False, name

def test_aggregators_are_discovery_only_and_disabled():
    for name in ("Zillow (95006)", "Apartments.com (Boulder Creek)"):
        s = next(x for x in RENTAL_SOURCES if x["name"] == name)
        assert s["collection_class"] == "discovery_only" and s["enabled"] is False

def test_excluded_managers_absent_or_disabled():
    # Kendall & Potter and Cheshire Rio do not serve 95006 long-term
    for s in RENTAL_SOURCES:
        if s["name"] in ("Kendall & Potter", "Cheshire Rio Realty"):
            assert s["enabled"] is False
