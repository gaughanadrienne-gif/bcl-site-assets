"""Parser for Streamline 831's custom rental-listings page (markdown export).

Each listing is an `## {heading}` block (the heading is either a street
address or "(Undisclosed Address) {City}" for owner-privacy listings, or a
non-listing branch/office card with no fields at all) followed by
`**Field:** value` lines. Every field is optional except the heading itself;
price/beds/baths/type/availability may all be absent for a given card. There
is no per-listing detail URL, so `url` falls back to the source's list-page
url. `undisclosed=True` when the heading contains "Undisclosed" -- the city
is then recovered from the heading (the Address field is absent in that
case).
"""

import re

from shared.bcl_ingest import SLV_TOWNS, sanitize_text, scrub_pii

_FIELD_RE = re.compile(r"\*\*([^*:]+):\*\*\s*(.+)")
_ADDRESS_RE = re.compile(r"([^,]+),\s*([^,]+?),\s*(?:CA\s*)?(\d{5})")
_UNDISCLOSED_RE = re.compile(r"\(undisclosed address\)", re.I)

# Fallback for addresses missing the comma between street and city, e.g.
# "11691 Alta Via Dr Brookdale, CA 95007" (seen live in the Streamline feed).
# Only recognizes the known SLV town names -- it's a narrow fallback, not a
# general address parser.
_TOWN_ALT = "|".join(re.escape(t) for t in SLV_TOWNS.values())
_ADDRESS_NO_COMMA_RE = re.compile(
    r"(.+?)\s+(" + _TOWN_ALT + r")\s*,\s*(?:CA\s*)?(\d{5})", re.I
)


def _fields(chunk):
    out = {}
    for line in chunk.splitlines():
        m = _FIELD_RE.match(line.strip())
        if m:
            key = m.group(1).strip().lower()
            out.setdefault(key, sanitize_text(m.group(2)))
    return out


def _first_number(text):
    m = re.search(r"([\d,]+)", text or "")
    return m.group(1).replace(",", "") if m else ""


def parse(markdown, source):
    text = markdown or ""
    parts = re.split(r"(?m)^##\s+", text)
    rows = []
    for part in parts[1:]:
        heading_line, _, body = part.partition("\n")
        heading = sanitize_text(heading_line)
        fields = _fields(body)
        if not fields:
            continue  # non-listing card (branch/office photo, nav heading)

        undisclosed = bool(_UNDISCLOSED_RE.search(heading))
        monthly_rent = _first_number(fields.get("price", ""))
        bedrooms = _first_number(fields.get("beds", ""))
        bathrooms = _first_number(fields.get("baths", ""))
        square_feet = _first_number(fields.get("area") or fields.get("size") or "")
        address = fields.get("address", "")
        addr_m = _ADDRESS_RE.match(address)
        street = city = postal_code = ""
        if addr_m:
            street = addr_m.group(1).strip()
            city = addr_m.group(2).strip()
            postal_code = addr_m.group(3)
        else:
            addr_m2 = _ADDRESS_NO_COMMA_RE.match(address)
            if addr_m2:
                street = addr_m2.group(1).strip()
                city = addr_m2.group(2).strip()
                postal_code = addr_m2.group(3)
            elif undisclosed:
                city = _UNDISCLOSED_RE.sub("", heading).strip()

        property_type = fields.get("type", "")
        available_date = fields.get("availability", "")
        headline = "%s, %s" % (street, city) if street else heading

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
            "url": source.get("url", ""),
            "description": scrub_pii(sanitize_text(body)),
            "undisclosed": undisclosed,
            "lease_term_text": fields.get("lease type", ""),
        })
    return rows
