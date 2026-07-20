"""Parser for Paycom (paycomonline.net) candidate-portal markdown pages.

Each posting is a markdown-link block:
    [**{TITLE}**\\
    \\
    Hot Job\\
    \\
    {JobType}\\
    \\
    {Site} - {City}, CA {zip}\\
    \\
    {description}...](url)

`Hot Job` is a badge, not a field, and is stripped. Some rows have two
locations separated by "; " -- the first is used for geo-filtering.
"""

import re

from shared.bcl_ingest import sanitize_text

_BLOCK_RE = re.compile(
    r"\[\*\*(?P<title>.+?)\*\*\\+\s*\n(?P<rest>.*?)\]\((?P<url>https://www\.paycomonline\.net/[^)]+)\)",
    re.DOTALL,
)
_LOC_RE = re.compile(r"-\s*([A-Za-z .]+?),\s*CA\s*\d{5}")


def _segments(rest):
    # Lines are markdown hard-breaks ("\" at end of line); strip backslashes
    # and blank lines to get the ordered field list.
    cleaned = rest.replace("\\", "\n")
    return [sanitize_text(line) for line in cleaned.split("\n") if sanitize_text(line)]


def parse(markdown, source):
    rows = []
    for m in _BLOCK_RE.finditer(markdown):
        title = sanitize_text(m.group("title")).replace("Hot Job", "").strip()
        segs = [s for s in _segments(m.group("rest")) if s.lower() != "hot job"]

        location_text = ""
        job_type = ""
        description = ""
        for seg in segs:
            if _LOC_RE.search(seg) and not location_text:
                location_text = seg
            elif not job_type and not _LOC_RE.search(seg):
                job_type = seg
            elif seg and seg != job_type:
                description = seg

        loc_m = _LOC_RE.search(location_text)
        city = loc_m.group(1).strip() if loc_m else ""
        # Some listings drop the space before "Cruz" (e.g. "SantaCruz, CA
        # 95060"), which fails the commute-table lookup; normalize it.
        if city == "SantaCruz":
            city = "Santa Cruz"

        rows.append({
            "title": title, "employer": sanitize_text(source.get("name", "")),
            "location_text": location_text, "city": city, "url": m.group("url"),
            "date_posted": "",
            "salary_text": "", "benefits_text": "", "hours_text": job_type,
            "description": description, "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
        })
    return rows
