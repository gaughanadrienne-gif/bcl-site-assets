"""Parser for a Buildium public rentals page (markdown export).

Built for Sol Property Management's server-rendered Buildium page
(solpropertymanagement.managebuilding.com/Resident/public/rentals). Firecrawl
renders each listing as ONE image-link card whose link text holds, separated
by markdown hard breaks ("\\" line ends):

    **{street}**
    {city}, {ST} {zip}
    {n} Bed | {n} Bath | {n} sqft
    {description, truncated with "..."}
    ${rent}
    available {date}

and whose link target is the listing detail page ".../Resident/public/rentals/{id}".
Buildium shows the full street, so undisclosed is always False.
"""

import re

from shared.bcl_ingest import sanitize_text, scrub_pii

_CARD_RE = re.compile(
    r"\[!\[[^\]]*\]\([^)]*\)(?P<body>.*?)\]\((?P<url>https?://[^)\s]*/Resident/public/rentals/\d+)\)",
    re.S,
)
_STREET_RE = re.compile(r"\*\*(.+?)\*\*")
_CITY_RE = re.compile(r"^([^,]+),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$")
_BEDS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*Beds?\b|\bStudio\b", re.I)
_BATHS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*Baths?\b", re.I)
_SQFT_RE = re.compile(r"([\d,]+)\s*sq\s*ft", re.I)
_RENT_LINE_RE = re.compile(r"^\$\s*([\d,]+)(?:\.\d{2})?$")
_AVAILABLE_RE = re.compile(r"^available\s+(.+)$", re.I)


def parse(markdown, source):
    rows = []
    for match in _CARD_RE.finditer(markdown or ""):
        body = match.group("body").replace("\\|", "|")
        lines = [ln.strip().rstrip("\\").strip() for ln in body.splitlines()]
        lines = [ln for ln in lines if ln]

        street = city = postal_code = ""
        monthly_rent = bedrooms = bathrooms = square_feet = available_date = ""
        description_parts = []
        for line in lines:
            street_m = _STREET_RE.fullmatch(line)
            city_m = _CITY_RE.match(line)
            rent_m = _RENT_LINE_RE.match(line)
            avail_m = _AVAILABLE_RE.match(line)
            if street_m and not street:
                street = sanitize_text(street_m.group(1))
            elif city_m and not city:
                city = sanitize_text(city_m.group(1))
                postal_code = city_m.group(3)
            elif "|" in line and _BATHS_RE.search(line) and not bathrooms:
                beds_m = _BEDS_RE.search(line)
                if beds_m:
                    bedrooms = beds_m.group(1) if beds_m.group(1) else "0"
                bathrooms = _BATHS_RE.search(line).group(1)
                sqft_m = _SQFT_RE.search(line)
                square_feet = sqft_m.group(1).replace(",", "") if sqft_m else ""
            elif rent_m:
                monthly_rent = rent_m.group(1).replace(",", "")
            elif avail_m:
                available_date = sanitize_text(avail_m.group(1))
            elif street:
                description_parts.append(line)

        if monthly_rent == "0":
            monthly_rent = ""
        if not street or (not monthly_rent and not bedrooms):
            continue  # not a listing card

        rows.append({
            "headline": "%s, %s" % (street, city) if city else street,
            "address_public": street,
            "city": city,
            "postal_code": postal_code,
            "monthly_rent": monthly_rent,
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "square_feet": square_feet,
            "available_date": available_date,
            "property_type": "",
            "url": match.group("url"),
            "description": scrub_pii(sanitize_text(" ".join(description_parts))),
            "undisclosed": False,
        })
    return rows
