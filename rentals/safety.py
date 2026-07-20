"""Scam-indicator and fair-housing keyword gates for rentals.

These gates route a would-be-published listing to the review queue in
refresh_rentals.py -- they NEVER auto-publish a flagged listing and NEVER
reword or otherwise alter the listing text. They exist purely to flag a
human for review; the wording (even if discriminatory) is left untouched
so the owner can see exactly what was scraped.
"""

import re

_SCAM_PATTERNS = (
    "wire transfer", "wire the", "wire deposit", "gift card", "cryptocurrency",
    "bitcoin", "money order", "western union", "before viewing", "without seeing",
    "overseas", "out of the country", "moving company will", "keys will be mailed",
    "zelle", "cash app", "cashapp", "venmo", "certified funds",
)

_FAIR_HOUSING_PATTERNS = (
    "no children", "no kids", "adults only", "christians only", "christian only",
    "muslims only", "muslim only", "no disabled", "must be employed by",
    "english speaking only", "english-speaking only", "no section 8",
    # disability / assistance animals
    "no service animals", "no emotional support animals", "no esa", "able-bodied",
    # source of income (CA-protected)
    "no vouchers", "no housing assistance", "no hcv", "no hud",
    # familial status
    "no families", "no infants", "single professional preferred",
)

# Preference forms for protected classes ("christian household preferred",
# "prefer a ... couple/tenant", "ideal for ...") -- these don't fit a fixed
# phrase list since the protected class and the object noun both vary.
_PROTECTED_CLASS_RE = (
    r"(black|white|asian|hispanic|latino|jewish|muslim|christian)"
)
_PREFERENCE_RE = re.compile(
    r"\b" + _PROTECTED_CLASS_RE
    + r"\w*\s+(household|family|families|tenant|tenants|couple|couples|renter|renters)\s+preferred\b"
)
_PREFER_A_RE = re.compile(
    r"\bprefer(?:s|red)?\s+a\s+(?:quiet\s+|professional\s+)?(couple|single tenant|tenant)\b"
)
_IDEAL_FOR_RE = re.compile(
    r"\bideal for\s+(?:a\s+|an\s+)?" + _PROTECTED_CLASS_RE + r"\b"
)

_LOW_RENT_CEILING = 600


def _haystack(rental):
    return (str(rental.get("headline", "")) + " " + str(rental.get("description", ""))
            + " " + str(rental.get("description_summary", ""))).lower()


def scam_flags(rental):
    """Return matched scam indicators from headline/description; [] if clean."""
    text = _haystack(rental)
    flags = [kw for kw in _SCAM_PATTERNS if kw in text]

    rent = rental.get("monthly_rent")
    try:
        rent_val = float(rent) if rent not in (None, "") else None
    except (TypeError, ValueError):
        rent_val = None
    if rent_val is not None and 0 < rent_val < _LOW_RENT_CEILING:
        flags.append("implausibly-low-rent")
    return flags


def fair_housing_flags(rental):
    """Return matched potential fair-housing violations; [] if clean."""
    text = _haystack(rental)
    flags = [kw for kw in _FAIR_HOUSING_PATTERNS if kw in text]

    # Race/religion/national-origin preference patterns ("christian tenants only",
    # "no [group]" style exclusions) beyond the fixed phrase list above.
    if re.search(r"\bno\s+(black|white|asian|hispanic|latino|jewish|muslim|christian)\b", text):
        flags.append("protected-class-exclusion")

    # Preference forms for protected classes ("christian household preferred",
    # "prefer a professional couple", "ideal for a christian family").
    if _PREFERENCE_RE.search(text) or _PREFER_A_RE.search(text) or _IDEAL_FOR_RE.search(text):
        flags.append("protected-class-preference")

    return flags


def safety_status(rental):
    """Return (ok, reasons). ok is False if either gate has a hit."""
    scam = scam_flags(rental)
    fair_housing = fair_housing_flags(rental)
    reasons = ["scam:%s" % f for f in scam] + ["fairhousing:%s" % f for f in fair_housing]
    return (not reasons), reasons
