"""Verified rentals source registry (San Lorenzo Valley: 95005/06/07/18).
Confirmed live SLV inventory -> enabled. Rotating/unconfirmed -> enabled=False.
Aggregators -> discovery_only (link out, never scraped)."""

from shared.registry import validate_registry


def _s(name, cclass, platform, parser, url, priority, enabled, terms_ok, notes="", config=None):
    return dict(name=name, tool="rentals", collection_class=cclass, platform=platform,
                parser=parser, url=url, geo="area", priority=priority, enabled=enabled,
                terms_ok=terms_ok, notes=notes, config=config or {})


RENTAL_SOURCES = [
    # --- Confirmed live SLV-wide inventory (build first) ---
    _s("Scotts Valley Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://scottsvalley.appfolio.com/listings", 5, True, True,
       "14630 Two Bar Rd #5 confirmed; SLV-wide", {"slug": "scottsvalley"}),
    _s("PMI Santa Cruz", "direct_page_reviewed", "rentvine", "rentvine",
       "https://www.pmisantacruz.com/santa-cruz-homes-for-rent", 5, True, True,
       "12895 Highway 9 confirmed; RentVine widget; SLV-wide", {"portal": "pmisantacruz.rentvine.com"}),
    _s("Streamline 831", "direct_page_reviewed", "custom_html", "custom_html",
       "https://streamline831.com/rental-listings/", 5, True, True, "13350 Big Basin Way confirmed; SLV-wide"),
    _s("Blue Sky Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://blueskysantacruz.appfolio.com/listings", 6, True, True,
       "AppFolio parser verified; enabled for SLV widening (plan 4b)", {"slug": "blueskysantacruz"}),
    # --- Serve SLV, unverified slug/parser -> SLV follow-up ---
    _s("Santa Cruz Property Management Co.", "direct_page_reviewed", "custom_html", "custom_html",
       "https://santacruzproperty.com/rental_listings.cfm", 7, False, False, "ColdFusion; unverified -- SLV follow-up"),
    _s("Bailey Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://baileypm.com/long-term-rentals/ltr-search-new", 8, False, False, "JS widget; unverified -- SLV follow-up"),
    _s("Western Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://www.westernpropertymanagement.net/rental-availability", 8, False, False, "slug unconfirmed -- SLV follow-up"),
    _s("Utopia Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://utopiamanagement.com/rental-list/santa-cruz-ca", 9, False, False, "BC page redirects to SC list -- SLV follow-up"),
    _s("PowerWest Properties", "direct_page_reviewed", "appfolio", "appfolio",
       "https://www.powerwestrentals.com/rental_listings", 9, False, False, "0/0 at check -- SLV follow-up"),
    # --- Excluded (do not serve 95006 long-term) ---
    _s("Kendall & Potter", "disabled", "appfolio", "appfolio",
       "https://montereycoast.com/rentals-appfolio/", 20, False, False, "enumerated zips exclude 95006"),
    _s("Cheshire Rio Realty", "disabled", "custom_html", "custom_html",
       "https://cheshirerio.com/", 20, False, False, "Escapia vacation rentals, not long-term"),
    # --- Aggregators (discovery-only, link out) ---
    _s("Zillow (95006)", "discovery_only", "discovery", "discovery",
       "https://www.zillow.com/boulder-creek-ca-95006/rentals/", 30, False, False),
    _s("Apartments.com (Boulder Creek)", "discovery_only", "discovery", "discovery",
       "https://www.apartments.com/boulder-creek-ca/", 30, False, False),
    _s("AffordableHousing.com (95006)", "discovery_only", "discovery", "discovery",
       "https://www.affordablehousing.com/boulder-creek-ca/", 30, False, False, "income-restricted"),
]

validate_registry(RENTAL_SOURCES)
