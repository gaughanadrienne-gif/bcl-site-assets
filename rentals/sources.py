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
    _s("Scotts Valley Property Management", "direct_page_reviewed", "drupal_table", "markdown_table",
       "https://www.scottsvalleyproperty.com/available_rentals", 5, True, True,
       "Own-site vacancy table (Location | Address | Bedrooms | Monthly Rent). The AppFolio "
       "portal scottsvalley.appfolio.com is empty because the company posts vacancies on its "
       "own site (verified 2026-09-13: 7 rows, 4 in SLV towns). The table has a town but no "
       "ZIP, so the parser maps only the four exact SLV town names to their ZIPs.",
       {"appfolio_portal": "https://scottsvalley.appfolio.com/listings"}),
    _s("PMI Santa Cruz", "direct_page_reviewed", "rentvine", "rentvine",
       "https://www.pmisantacruz.com/santa-cruz-homes-for-rent", 5, True, True,
       "12895 Highway 9 confirmed; RentVine widget; SLV-wide", {"portal": "pmisantacruz.rentvine.com"}),
    _s("C&C Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://ccpmgmt.appfolio.com/listings", 7, True, True,
       "Felton is in its service area; 155 West Drive, Felton 95018 verified 2026-09-13 "
       "(1 SLV listing of 71 unique addresses). AppFolio parser verified.",
       {"slug": "ccpmgmt"}),
    _s("Utopia Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://utopiamanagement.appfolio.com/listings", 9, True, True,
       "National AppFolio portal (CA, OR, WA, NV, NM); the SLV ZIP filter does the geography. "
       "About 300 listings across pages 1 and 2 (pages 3 to 5 empty) on 2026-09-13; one SLV: "
       "10585 Redwood Dr., Felton 95018 (rent not posted). Paginated via config.",
       {"slug": "utopiamanagement",
        "page_url_template": "https://utopiamanagement.appfolio.com/listings/listings?page={n}",
        "max_pages": 5}),
    _s("Santa Cruz Property Management Co.", "direct_page_reviewed", "coldfusion", "coldfusion_cards",
       "https://santacruzproperty.com/rental_listings.cfm", 7, True, True,
       "Custom ColdFusion listing cards; parser verified 2026-09-13 against 9 listings "
       "(0 SLV, 1 Scotts Valley). Address has no comma before the city; the printed ZIP "
       "decides SLV."),
    _s("Sol Property Management", "direct_page_reviewed", "buildium", "buildium",
       "https://solpropertymanagement.managebuilding.com/Resident/public/rentals", 6, True, True,
       "Public Buildium rentals page, server-rendered. The Squarespace company site "
       "solpropertymanagement.com links this page. Serves Santa Clara, Santa Cruz and Monterey "
       "counties. 2 SLV listings verified 2026-09-13 (14255 Highway 9, Boulder Creek 95006; "
       "9456 East Zayante Road, Felton 95018). Its TenantTurner page renders client-side, do not use."),
    _s("Blue Sky Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://blueskysantacruz.appfolio.com/listings", 6, True, True,
       "AppFolio parser verified; enabled for SLV widening (plan 4b)", {"slug": "blueskysantacruz"}),
    _s("Bailey Property Management", "direct_page_reviewed", "appfolio", "appfolio",
       "https://baileypm.appfolio.com/listings", 6, True, True,
       "325 Vista Robles Dr., Ben Lomond 95005 confirmed; AppFolio parser verified", {"slug": "baileypm"}),
    _s("PowerWest Properties", "direct_page_reviewed", "appfolio", "appfolio",
       "https://powerwest.appfolio.com/listings", 6, False, True,
       "Disabled 2026-09-13: 10 of 11 listings in Chico, 1 in Santa Cruz, none SLV. The old "
       "Ben Lomond office note (333 Dakenbrook Drive, 95005) did not reflect its inventory.",
       {"slug": "powerwest"}),
    _s("Streamline 831", "direct_page_reviewed", "custom_html", "custom_html",
       "https://streamline831.com/rental-listings/", 6, False, True,
       "Disabled 2026-09-13: the rental page shows no listings, only office cards, across "
       "20+ dry runs. Parser kept (custom_html) for re-enable if listings return."),
    _s("Anderson Christie Real Estate", "direct_page_reviewed", "appfolio", "appfolio",
       "https://andersonchristierealestate.appfolio.com/listings", 6, True, True,
       "13127 Hazel Ave, Boulder Creek 95006 confirmed; AppFolio parser verified. "
       "2026-07-29 re-verified: portal serves 17 listings to a plain HTTP client "
       "(no browser needed), parser returns 15 rows, and NONE are in an SLV ZIP -- "
       "nearest are Mount Hermon 95041 and Scotts Valley 95066. Publishing 0 is "
       "the tier filter working, not a broken adapter. The ~71 listings on "
       "andersonchristie.com are MLS FOR-SALE properties (PropertyMinder IDX), "
       "not rentals, and are out of scope for this board.",
       {"slug": "andersonchristierealestate"}),
    # --- Serve SLV, not yet onboarded (watch list) ---
    # parser="discovery" is a deliberate placeholder: it has no entry in
    # refresh_rentals.PARSERS, so an accidental enable scrapes nothing.
    _s("Western Property Management", "direct_page_reviewed", "rentengine", "discovery",
       "https://www.westernpropertymanagement.net/rental-availability", 8, False, False,
       "RentEngine listings, browser-rendered; no parser verified. SLV follow-up."),
    _s("Pelican Property Management", "direct_page_reviewed", "buildium_wordpress", "discovery",
       "https://pelicanrent.com/search-rentals/", 8, False, False,
       "Watch entry. Buildium WordPress plugin. 0 vacancies on 2026-09-13, so no parser can be "
       "verified. Has Felton, Ben Lomond and Boulder Creek service pages. Recheck monthly."),
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
