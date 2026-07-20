"""Parser for AppFolio listing pages (markdown export).

Each listing is an image-link card (RENT, BED/BATH) immediately followed by a
plain-text detail block: an "## [Title](detail-url)" heading, an address line
"{street}, {city}, CA {zip}", an "Available {NOW|M/D/YY}" line, and sometimes
"Square Feet N". A "$0" / no-bed-bath card is the "Online Rental Application"
placeholder and is skipped. AppFolio always shows the full address, so
undisclosed is always False. Empty-state pages (no cards) return [].
"""

import re

from shared.bcl_ingest import sanitize_text

_CARD_RE = re.compile(
    r"\[!\[[^\]]*\]\([^)]*\)(?P<body>.*?)\]\((?P<url>https://[^)\s]*?/listings/detail/[^)\s]+)\)",
    re.S,
)
_RENT_RE = re.compile(r"\$([\d,]+)")
_BEDBATH_RE = re.compile(r"(\d+)\s*bd\s*/\s*(\d+)\s*ba", re.I)
_SQFT_RE = re.compile(r"Square Feet\s*([\d,]+)", re.I)
_AVAILABLE_RE = re.compile(r"Available\s*(NOW|[\d/]+)", re.I)
_ADDRESS_RE = re.compile(r"([^\n,]+),\s*([^\n,]+?),\s*CA\s*(\d{5})(?:-\d+)?")


def parse(markdown, source):
    text = markdown or ""
    matches = list(_CARD_RE.finditer(text))
    rows = []
    for i, match in enumerate(matches):
        url = match.group("url")
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        detail = text[start:end]
        combined = match.group("body") + "\n" + detail

        rent_m = _RENT_RE.search(combined)
        monthly_rent = rent_m.group(1).replace(",", "") if rent_m else ""

        bb_m = _BEDBATH_RE.search(combined)
        if not bb_m or not monthly_rent or monthly_rent == "0":
            continue  # $0 / missing bed-bath -> "Online Rental Application" placeholder

        bedrooms, bathrooms = bb_m.group(1), bb_m.group(2)

        sqft_m = _SQFT_RE.search(detail)
        square_feet = sqft_m.group(1).replace(",", "") if sqft_m else ""

        addr_m = _ADDRESS_RE.search(detail)
        street = city = postal_code = ""
        if addr_m:
            street = sanitize_text(addr_m.group(1))
            city = sanitize_text(addr_m.group(2))
            postal_code = addr_m.group(3)

        avail_m = _AVAILABLE_RE.search(detail)
        available_date = sanitize_text(avail_m.group(1)) if avail_m else ""

        headline = "%s, %s" % (street, city) if street else city

        rows.append({
            "headline": headline,
            "address_public": street,
            "city": city,
            "postal_code": postal_code,
            "monthly_rent": monthly_rent,
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "square_feet": square_feet,
            "available_date": available_date,
            "property_type": "",
            "url": url,
            "description": "",
            "undisclosed": False,
        })
    return rows
