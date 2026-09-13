"""Parser for AppFolio listing pages (markdown export).

Each listing is an image-link card (RENT, BED/BATH) immediately followed by a
plain-text detail block: an "## [Title](detail-url)" heading, an address line
"{street}, {city}, {ST} {zip}", an "Available {NOW|M/D/YY}" line, and sometimes
"Square Feet N". A card with no bed/bath is the "Online Rental Application"
placeholder and is skipped. A "$0" card that DOES carry a bed/bath count is a
real unit whose rent is not posted (seen on Utopia Management's national
portal, including a Felton home), so it is kept with an empty rent. The state
is matched generically because national portals mix CA, OR, WA, NV and NM
listings; the SLV filter downstream does the geography. AppFolio always shows the full address, so
undisclosed is always False. Empty-state pages (no cards) return [].
"""

import re

from shared.bcl_ingest import sanitize_text, scrub_pii

_CARD_RE = re.compile(
    r"\[!\[[^\]]*\]\([^)]*\)(?P<body>.*?)\]\((?P<url>https://[^)\s]*?/listings/detail/[^)\s]+)\)",
    re.S,
)
_RENT_RE = re.compile(r"\$([\d,]+)")
_BEDBATH_RE = re.compile(r"(\d+|Studio)\s*(?:bd)?\s*/\s*(\d+(?:\.\d+)?)\s*ba", re.I)
_SQFT_RE = re.compile(r"Square Feet\s*([\d,]+)", re.I)
_AVAILABLE_RE = re.compile(r"Available\s*(NOW|[\d/]+)", re.I)
_ADDRESS_RE = re.compile(r"([^\n,]+),\s*([^\n,]+?),\s*[A-Z]{2}\s*(\d{5})(?:-\d+)?")


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
        if not bb_m or not monthly_rent:
            continue  # missing bed-bath -> "Online Rental Application" placeholder
        if monthly_rent == "0":
            monthly_rent = ""  # real unit, rent not posted; the board shows "Contact for rent"

        bedrooms, bathrooms = bb_m.group(1), bb_m.group(2)
        if bedrooms.lower() == "studio":
            bedrooms = "0"

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
            "description": scrub_pii(sanitize_text(detail)),
            "undisclosed": False,
        })
    return rows
