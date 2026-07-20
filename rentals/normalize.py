"""Map a parser's raw rental dict to the public rentals schema (spec section 7),
and decide which normalized rentals are safe to publish vs. route to the
review queue vs. reject outright.

BCL rule (spec 6.1): strict ZIP 95006. A confirmed-95006 listing publishes.
A verified-PM listing that's in Boulder Creek but has no disclosed address/ZIP
(an owner-privacy listing) is NEVER auto-published and NEVER rejected -- it
routes to the review queue for a human to verify. Anything else (another ZIP,
another city) is rejected. Commercial/vacation/for-sale/placeholder/min-stay
listings are excluded regardless of location.
"""

import re

from shared.bcl_ingest import is_95006, make_slug, record_fingerprint, sanitize_text, scrub_pii

_NUM_RE = re.compile(r"[\d,]+(?:\.\d+)?")

RENTAL_EXCLUDE = (
    "commercial", "vacation", "vacation rental", "short-term", "short term",
    "for sale", "for-sale",
)


def _num(value):
    """Coerce a raw numeric-ish field (int/float/str) to a number, or None."""
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return value
    m = _NUM_RE.search(str(value))
    if not m:
        return None
    s = m.group(0).replace(",", "")
    if not s:
        return None
    return float(s) if "." in s else int(s)


def _rental_scope(raw):
    text = (sanitize_text(raw.get("headline", "")) + " " + sanitize_text(raw.get("property_type", ""))
            + " " + sanitize_text(raw.get("description", ""))).lower()
    if re.search(r"\broom\b", text):
        return "private-room"
    if re.search(r"\bshared\b", text):
        return "shared"
    return "entire"


def _location_precision(address_public, postal_code, undisclosed):
    if address_public and postal_code:
        return "exact"
    if postal_code:
        return "zip-only"
    if undisclosed:
        return "approximate"
    return "unknown"


def normalize_rental(raw, source, today):
    address_public = sanitize_text(raw.get("address_public", ""))
    city = sanitize_text(raw.get("city", ""))
    postal_code = sanitize_text(raw.get("postal_code", ""))
    undisclosed = bool(raw.get("undisclosed"))
    property_type = sanitize_text(raw.get("property_type", ""))
    headline = sanitize_text(raw.get("headline", "")) or ("%s, %s" % (address_public, city)).strip(", ")
    url = raw.get("url", "") or ""
    monthly_rent = _num(raw.get("monthly_rent"))
    bedrooms = _num(raw.get("bedrooms"))
    bathrooms = _num(raw.get("bathrooms"))
    square_feet = _num(raw.get("square_feet"))
    description = sanitize_text(raw.get("description", ""))
    description_lower = description.lower()
    furnished = (
        ("furnished" in description_lower and "unfurnished" not in description_lower)
        or "furnished" in headline.lower()
    )

    return {
        "id": record_fingerprint([address_public or headline, city, url]),
        "slug": make_slug(city, address_public or headline),
        "headline": headline,
        "property_type": property_type,
        "rental_scope": _rental_scope(raw),
        "address_public": address_public,
        "city": city,
        "state": "CA",
        "postal_code": postal_code,
        "location_precision": _location_precision(address_public, postal_code, undisclosed),
        "monthly_rent": monthly_rent,
        "total_monthly_price": monthly_rent,
        "deposit": None,
        "application_fee": None,
        "bedrooms": bedrooms,
        "bathrooms": bathrooms,
        "square_feet": square_feet,
        "available_date": sanitize_text(raw.get("available_date", "")),
        "lease_term": sanitize_text(raw.get("lease_term_text", "")),
        "minimum_stay_days": None,
        "furnished": furnished,
        "pets_policy": sanitize_text(raw.get("pets_policy", "")),
        "utilities_text": sanitize_text(raw.get("utilities_text", "")),
        "parking_text": sanitize_text(raw.get("parking_text", "")),
        "laundry_text": sanitize_text(raw.get("laundry_text", "")),
        "description_summary": scrub_pii(description)[:300],
        "canonical_url": url,
        "source": source.get("name", ""),
        "property_manager": source.get("name", ""),
        "first_seen_at": today,
        "last_verified_at": today,
        "verification_status": "verified",
        "freshness_label": "",
    }


def include_rental(rental):
    """Return (status, reason) where status in {"publish", "queue", "reject"}."""
    haystack = (str(rental.get("property_type", "")) + " " + str(rental.get("headline", ""))).lower()
    for kw in RENTAL_EXCLUDE:
        if kw in haystack:
            return "reject", "excluded-type"

    if not rental.get("monthly_rent") and not rental.get("bedrooms"):
        return "reject", "placeholder"

    min_stay = rental.get("minimum_stay_days")
    if min_stay is not None and min_stay < 30:
        return "reject", "min-stay-under-30"

    if is_95006(rental):
        return "publish", None

    city = str(rental.get("city", "")).lower()
    if "boulder creek" in city and not rental.get("postal_code"):
        return "queue", "undisclosed-95006-verify"

    return "reject", "not-95006"
