"""Parser for Paylocity (recruiting.paylocity.com) candidate-portal markdown
pages. These are typically single-site employers with no per-job city --
`city` is left empty and the caller falls back to the source's employer
geo hint.

Each posting:
    [{title}](https://recruiting.paylocity.com/Recruiting/Jobs/Details/{id})

    {MM/DD/YYYY} \\- {Department}

    {Facility}
"""

import re
from datetime import datetime

from shared.bcl_ingest import sanitize_text

_BLOCK_RE = re.compile(
    r"\[(?P<title>[^\]]+)\]\((?P<url>https://recruiting\.paylocity\.com/Recruiting/Jobs/Details/\d+)\)"
    r"\s*\n+(?P<date>\d{2}/\d{2}/\d{4})\s*\\?-\s*(?P<dept>[^\n]+)"
    r"(?:\s*\n+(?P<facility>[^\n]+))?",
)


def _to_iso(mmddyyyy):
    try:
        return datetime.strptime(mmddyyyy, "%m/%d/%Y").date().isoformat()
    except ValueError:
        return ""


def parse(markdown, source):
    rows = []
    for m in _BLOCK_RE.finditer(markdown):
        facility = sanitize_text(m.group("facility") or "")
        rows.append({
            "title": sanitize_text(m.group("title")), "employer": sanitize_text(source.get("name", "")),
            "location_text": facility, "city": "", "url": m.group("url"),
            "date_posted": _to_iso(m.group("date")),
            "salary_text": "", "benefits_text": "", "hours_text": "",
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "", "category": sanitize_text(m.group("dept")),
        })
    return rows
