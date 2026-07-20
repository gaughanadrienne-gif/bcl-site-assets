"""Parser for Dayforce (jobs.dayforcehcm.com) candidate-portal markdown pages.

Each posting is a repeating block:
    - [**{title}**]({url})
    ... (blank lines)
    {site} - {street}, {city}, California, United States of America
    ... (blank lines)
    Posted {Weekday}, {Month} {Day}, {Year} \\| Expires ...
    ... description text ...
    [Read More](...)
    Req# {id}
"""

import re
from datetime import datetime

from shared.bcl_ingest import sanitize_text

_TITLE_RE = re.compile(
    r"\[\*\*(?P<title>.+?)\*\*\]\((?P<url>https://jobs\.dayforcehcm\.com/en-US/[^)]+/jobs/\d+)\)"
)
_ADDRESS_RE = re.compile(
    r"^(?P<addr>[^\n,]+,[^\n,]+,[^\n,]+,\s*California,\s*United States of America)\s*$",
    re.MULTILINE,
)
_POSTED_RE = re.compile(r"Posted\s+\w+,\s+(?P<month>\w+)\s+(?P<day>\d+),\s+(?P<year>\d+)")


def _parse_posted(chunk):
    m = _POSTED_RE.search(chunk)
    if not m:
        return ""
    try:
        dt = datetime.strptime("%s %s, %s" % (m.group("month"), m.group("day"), m.group("year")), "%B %d, %Y")
        return dt.date().isoformat()
    except ValueError:
        return ""


def _city_from_address(addr):
    parts = [p.strip() for p in addr.split(",")]
    return parts[2] if len(parts) >= 3 else ""


def parse(markdown, source):
    matches = list(_TITLE_RE.finditer(markdown))
    rows = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
        chunk = markdown[start:end]

        addr_m = _ADDRESS_RE.search(chunk)
        address = sanitize_text(addr_m.group("addr")) if addr_m else ""
        city = _city_from_address(address) if address else ""

        rows.append({
            "title": sanitize_text(m.group("title")), "employer": sanitize_text(source.get("name", "")),
            "location_text": address, "city": city, "url": m.group("url"),
            "date_posted": _parse_posted(chunk),
            "salary_text": "", "benefits_text": "", "hours_text": "",
            "description": sanitize_text(chunk)[:2000], "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
        })
    return rows
