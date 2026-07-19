from rentals.sources import RENTAL_SOURCES
from shared.registry import validate_registry


def test_registry_validates():
    assert validate_registry(RENTAL_SOURCES) is RENTAL_SOURCES

def test_all_rentals_tool():
    assert all(s["tool"] == "rentals" for s in RENTAL_SOURCES)

def test_confirmed_95006_managers_enabled():
    by_name = {s["name"]: s for s in RENTAL_SOURCES}
    for name in ("Scotts Valley Property Management", "PMI Santa Cruz", "Streamline 831"):
        assert by_name[name]["enabled"] is True, name

def test_aggregators_are_discovery_only_and_disabled():
    for name in ("Zillow (95006)", "Apartments.com (Boulder Creek)"):
        s = next(x for x in RENTAL_SOURCES if x["name"] == name)
        assert s["collection_class"] == "discovery_only" and s["enabled"] is False

def test_excluded_managers_absent_or_disabled():
    # Kendall & Potter and Cheshire Rio do not serve 95006 long-term
    for s in RENTAL_SOURCES:
        if s["name"] in ("Kendall & Potter", "Cheshire Rio Realty"):
            assert s["enabled"] is False
