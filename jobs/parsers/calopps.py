"""Parser for CalOpps (calopps.org) agency job-openings markdown pages.

The "Job Openings" section is a markdown table:
    | {close date} | [{title} ({req#})\\<br>\\<br>{tags}]({url}) | {category} |

CalOpps agencies (e.g. a county fire district) are county-wide with no
per-job city -- `city` is left empty and the caller falls back to the
source's employer geo hint.
"""

import re

from shared.bcl_ingest import sanitize_text

_ROW_RE = re.compile(
    r"\|\s*(?P<deadline>\d{2}/\d{2}/\d{4})\s*\|\s*"
    r"\[(?P<title>.+?)\]\((?P<url>https://www\.calopps\.org/[^)]+)\)\s*\|\s*"
    r"(?P<category>[^|\n]+?)\s*\|"
)
_REQ_RE = re.compile(r"\s*\(\d+\)\s*")


def _clean_title(raw_title):
    # Drop everything from the first "<br>" tag on (tags/subtitle), then the
    # "(req#)" suffix.
    head = re.split(r"\\?<br>", raw_title, maxsplit=1)[0]
    head = _REQ_RE.sub(" ", head)
    return sanitize_text(head)


def parse(markdown, source):
    rows = []
    for m in _ROW_RE.finditer(markdown):
        rows.append({
            "title": _clean_title(m.group("title")), "employer": sanitize_text(source.get("name", "")),
            "location_text": "", "city": "", "url": m.group("url"),
            "date_posted": "",
            "salary_text": "", "benefits_text": "", "hours_text": "",
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "", "category": sanitize_text(m.group("category")),
            "application_deadline": m.group("deadline"),
        })
    return rows
