"""Parser for EDJOIN (edjoin.org) markdown listing pages.

Each posting is a repeating block:
  [**Title**](https://www.edjoin.org/Home/JobPosting/<id>)
  District - City, County, State
  Deadline:
  <deadline value>
  $salary line
"""

import re

from shared.bcl_ingest import sanitize_text

_BLOCK_RE = re.compile(
    r"\[\*\*(?P<title>.+?)\*\*\]\((?P<url>https://www\.edjoin\.org/Home/JobPosting/\d+)\)"
    r"\s*\n+(?P<orgline>[^\n]+)\s*\n+"
    r".*?Deadline:\s*\n+(?P<deadline>[^\n]+)\s*\n+"
    r"(?P<salary>\$[^\n]+)",
    re.DOTALL,
)


def parse(markdown, source):
    rows = []
    for m in _BLOCK_RE.finditer(markdown):
        title = sanitize_text(m.group("title"))
        url = m.group("url")
        orgline = sanitize_text(m.group("orgline"))
        if " - " in orgline:
            employer, rest = orgline.split(" - ", 1)
        else:
            employer, rest = orgline, ""
        city = rest.split(",")[0].strip() if rest else ""
        rows.append({
            "title": title, "employer": sanitize_text(employer),
            "location_text": orgline, "city": city, "url": url,
            "date_posted": "",
            "salary_text": sanitize_text(m.group("salary")), "benefits_text": "",
            "hours_text": "",
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
            "application_deadline": sanitize_text(m.group("deadline")),
        })
    return rows
