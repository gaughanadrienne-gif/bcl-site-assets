"""Parser for Santa Cruz Property Management Co.'s ColdFusion listings page
(santacruzproperty.com/rental_listings.cfm, markdown export).

Each listing is a thumbnail image linked to "rental.cfm?id=N", followed by
"Available: {date}" (printed twice), a bold address line
"**{street} {city} CA {zip}**" with NO comma between street and city,
"{n} Bedroom(s) {n} Bathroom(s)", "Pets: ...", "First: $N Last: $N Deposit: $N"
and a free-text paragraph, then a "[More Details](rental.cfm?id=N)" link.

Because the address has no comma, the city is recovered by matching the end
of the street text against a known list of nearby towns (the SLV towns plus
the surrounding cities this manager lists). The ZIP is always printed, and the
SLV decision downstream uses the ZIP, so an unrecognized town only leaves
`city` blank; it can never make a non-SLV row publish. undisclosed is False.
"""

import re

from shared.bcl_ingest import SLV_TOWNS, sanitize_text, scrub_pii

_KNOWN_TOWNS = sorted(
    set(SLV_TOWNS.values()) | {
        "Santa Cruz", "Scotts Valley", "Capitola", "Soquel", "Aptos", "Watsonville",
        "Live Oak", "La Selva Beach", "Freedom", "Mount Hermon", "Zayante",
        "Los Gatos", "Campbell", "San Jose", "Santa Clara", "Cupertino", "Saratoga",
        "Sunnyvale", "Morgan Hill", "Gilroy",
    },
    key=len, reverse=True,
)
_CARD_RE = re.compile(
    r"\[!\[[^\]]*\]\([^)]*\)\]\((?P<url>https?://[^)\s]*rental\.cfm\?id=\d+)\)"
)
_ADDRESS_RE = re.compile(r"\*\*(?P<addr>[^*\n]+?)\s+CA\s+(?P<zip>\d{5})(?:-\d{4})?\s*\*\*")
_BEDS_RE = re.compile(r"(\d+)\s+Bedrooms?\b|\bStudio\b", re.I)
_BATHS_RE = re.compile(r"(\d+(?:\.\d+)?)\s+Bathrooms?\b", re.I)
_RENT_RE = re.compile(r"First:\s*\$\s*([\d,]+)", re.I)
_AVAILABLE_RE = re.compile(r"Available:\s*([^\n]+)", re.I)
_PETS_RE = re.compile(r"Pets:\s*([^\n]+)", re.I)
_FIELD_LINE_RE = re.compile(
    r"^\s*(?:Available:|Pets:|First:|\*\*|\[More Details\]|\d+\s+Bedrooms?\b|Studio\b)", re.I
)


def _split_street_city(addr):
    addr = sanitize_text(addr).rstrip(",")
    for town in _KNOWN_TOWNS:
        m = re.match(r"^(.*\S)[\s,]+" + re.escape(town) + r"$", addr, re.I)
        if m:
            return m.group(1).rstrip(","), town
    return addr, ""


def parse(markdown, source):
    text = markdown or ""
    matches = list(_CARD_RE.finditer(text))
    rows = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[match.end():end]
        footer = block.find("\n* * *")
        if footer != -1:
            block = block[:footer]

        addr_m = _ADDRESS_RE.search(block)
        if not addr_m:
            continue  # not a listing card
        street, city = _split_street_city(addr_m.group("addr"))
        postal_code = addr_m.group("zip")

        rent_m = _RENT_RE.search(block)
        monthly_rent = rent_m.group(1).replace(",", "") if rent_m else ""
        if monthly_rent == "0":
            monthly_rent = ""

        beds_m = _BEDS_RE.search(block)
        bedrooms = ""
        if beds_m:
            bedrooms = beds_m.group(1) if beds_m.group(1) else "0"
        baths_m = _BATHS_RE.search(block)
        bathrooms = baths_m.group(1) if baths_m else ""
        if not monthly_rent and not bedrooms:
            continue

        avail_m = _AVAILABLE_RE.search(block)
        pets_m = _PETS_RE.search(block)
        prose = " ".join(
            line for line in block.splitlines() if line.strip() and not _FIELD_LINE_RE.match(line)
        )

        rows.append({
            "headline": "%s, %s" % (street, city) if city else street,
            "address_public": street,
            "city": city,
            "postal_code": postal_code,
            "monthly_rent": monthly_rent,
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "square_feet": "",
            "available_date": sanitize_text(avail_m.group(1)) if avail_m else "",
            "property_type": "",
            "url": match.group("url"),
            "description": scrub_pii(sanitize_text(prose.replace("\\*", "*"))),
            "undisclosed": False,
            "pets_policy": sanitize_text(pets_m.group(1)) if pets_m else "",
        })
    return rows
