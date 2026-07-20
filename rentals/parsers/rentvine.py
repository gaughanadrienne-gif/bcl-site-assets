"""Parser for PMI Santa Cruz's RentVine widget markdown export.

Each listing renders as a single markdown link block: a nested property photo
link, then plain text lines (rent, beds, baths, sqft, address, property type,
availability), closed by the outer link's URL -- e.g.:

[![street , city,  zip](img-url)\\
$3,600/mo.\\
- Beds: 2\\
- Full Baths: 1\\
- Half Baths: 1\\
- sqft: 800\\
street, city, zip\\
Single Family Home\\
Available: Immediately](https://.../listing-url)

RentVine always shows the full address, so undisclosed is always False.
"""

import re

from shared.bcl_ingest import sanitize_text, scrub_pii

_CARD_RE = re.compile(r"\[!\[[^\]]*\]\([^)]*\)(?P<body>.*?)\]\((?P<url>https://[^)\s]+)\)", re.S)
_RENT_RE = re.compile(r"\$([\d,]+)\s*/\s*mo", re.I)
_BEDS_RE = re.compile(r"Beds:\s*([\d.]+)")
_FULL_BATHS_RE = re.compile(r"Full Baths:\s*([\d.]+)")
_HALF_BATHS_RE = re.compile(r"Half Baths:\s*([\d.]+)")
_BATHS_RE = re.compile(r"(?<!Full )(?<!Half )Baths:\s*([\d.]+)")
_SQFT_RE = re.compile(r"sqft:\s*([\d,]+)", re.I)
_ADDRESS_RE = re.compile(r"([^\n,]+),\s*([^\n,]+?),\s*(\d{5})(?:-\d+)?")
_AVAILABLE_RE = re.compile(r"Available:\s*([^\n]+)")
_PROPERTY_TYPES = (
    "Single Family Home", "Apartment", "Condo", "Townhouse",
    "Duplex", "Multiplex", "Loft", "Mobile Home",
)
_TYPE_RE = re.compile("|".join(re.escape(t) for t in _PROPERTY_TYPES))


def _bathrooms(body):
    full_m = _FULL_BATHS_RE.search(body)
    half_m = _HALF_BATHS_RE.search(body)
    if full_m or half_m:
        total = (float(full_m.group(1)) if full_m else 0.0) + (float(half_m.group(1)) * 0.5 if half_m else 0.0)
        return total
    baths_m = _BATHS_RE.search(body)
    return baths_m.group(1) if baths_m else ""


def parse(markdown, source):
    rows = []
    for match in _CARD_RE.finditer(markdown or ""):
        body = match.group("body")
        url = match.group("url")

        rent_m = _RENT_RE.search(body)
        monthly_rent = rent_m.group(1).replace(",", "") if rent_m else ""

        beds_m = _BEDS_RE.search(body)
        bedrooms = beds_m.group(1) if beds_m else ""

        if not rent_m and not beds_m:
            continue  # nav/logo image-link, not a listing card

        bathrooms = _bathrooms(body)

        sqft_m = _SQFT_RE.search(body)
        square_feet = sqft_m.group(1).replace(",", "") if sqft_m else ""

        addr_m = _ADDRESS_RE.search(body)
        street = city = postal_code = ""
        if addr_m:
            street = sanitize_text(addr_m.group(1))
            city = sanitize_text(addr_m.group(2))
            postal_code = addr_m.group(3)

        type_m = _TYPE_RE.search(body)
        property_type = type_m.group(0) if type_m else ""

        avail_m = _AVAILABLE_RE.search(body)
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
            "property_type": property_type,
            "url": url,
            "description": scrub_pii(sanitize_text(body)),
            "undisclosed": False,
        })
    return rows
