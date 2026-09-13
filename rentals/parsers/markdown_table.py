"""Parser for a rentals page published as a plain table (markdown export).

Built for Scotts Valley Property Management's own site
(scottsvalleyproperty.com/available_rentals, a Drupal view). Firecrawl renders
it as a pipe table with the columns Location | Address | Bedrooms | Monthly
Rent, where the Address cell is a link "[{listing title} - {street}](node-url)".

The table gives a town but never a ZIP. The ZIP is filled in ONLY when the
Location cell is exactly one of the four SLV town names (via SLV_TOWNS), so an
SLV row can publish and every other town keeps an empty postal_code and is
rejected downstream as not-SLV. A blank Bedrooms cell stays blank unless the
title says "Studio" (then "0"). The table shows the full street, so
undisclosed is always False.
"""

import re

from shared.bcl_ingest import SLV_TOWNS, sanitize_text, scrub_pii

_TOWN_TO_ZIP = {town.lower(): zip_code for zip_code, town in SLV_TOWNS.items()}
_LINK_RE = re.compile(r"^\[(?P<text>.+)\]\((?P<url>https?://[^)\s]+)(?:\s+\"[^\"]*\")?\)$")
_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _cells(line):
    line = line.strip()
    if not (line.startswith("|") and line.endswith("|")):
        return None
    return [c.strip() for c in line[1:-1].split("|")]


def _number(text):
    m = _NUM_RE.search(text or "")
    if not m:
        return ""
    value = m.group(0).replace(",", "")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value


def parse(markdown, source):
    rows = []
    header = None
    for line in (markdown or "").splitlines():
        cells = _cells(line)
        if cells is None:
            header = None
            continue
        if header is None:
            labels = [sanitize_text(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", c)).lower() for c in cells]
            if any(l.startswith("location") for l in labels) and any(l.startswith("address") for l in labels):
                header = labels
            continue
        if all(set(c) <= set("-: ") for c in cells):
            continue  # the |---| separator row
        if len(cells) != len(header):
            continue

        def col(prefix):
            for label, cell in zip(header, cells):
                if label.startswith(prefix):
                    return cell
            return ""

        location = sanitize_text(col("location"))
        address_cell = col("address")
        link = _LINK_RE.match(address_cell)
        if link:
            label, url = sanitize_text(link.group("text")), link.group("url")
        else:
            label, url = sanitize_text(address_cell), source.get("url", "")
        if not label:
            continue

        title, sep, street = label.rpartition(" - ")
        if not sep:
            title, street = "", label
        title, street = title.strip(), street.strip()

        monthly_rent = _number(col("monthly rent") or col("rent"))
        bedrooms = _number(col("bedroom"))
        if not bedrooms and re.search(r"\bstudio\b", label, re.I):
            bedrooms = "0"

        postal_code = _TOWN_TO_ZIP.get(location.lower(), "")
        headline = "%s, %s" % (street, location) if street and location else (street or location)

        rows.append({
            "headline": headline,
            "address_public": street,
            "city": location,
            "postal_code": postal_code,
            "monthly_rent": monthly_rent,
            "bedrooms": bedrooms,
            "bathrooms": "",
            "square_feet": "",
            "available_date": "",
            "property_type": "",
            "url": url,
            "description": scrub_pii(title),
            "undisclosed": False,
        })
    return rows
