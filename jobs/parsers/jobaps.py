"""Parser for JobAps (jobapscloud.com) markdown listing pages.

The captured page includes clean pipe-delimited tables (one per department
section): | Job Title | Agency | Salary | Additional Requirements |
Filing Deadline | Check Status |. Rows are identified by a bulpreview.asp
link in the first cell -- this is used across all department sections.
County-wide postings have no single city, so per the plan they're pinned
to Santa Cruz (core tier).
"""

import re

from shared.bcl_ingest import sanitize_text

_LINK_RE = re.compile(r'^\[([^\]]+)\]\(([^)\s"]+)')


def _split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _clean_title(raw):
    return sanitize_text(raw.replace("\\<br>", " ").replace("\\", ""))


def parse(markdown, source):
    rows = []
    for line in markdown.splitlines():
        line = line.strip()
        if not line.startswith("| [") or "bulpreview.asp" not in line or "---" in line:
            continue
        cells = _split_row(line)
        if len(cells) != 6:
            continue
        title_md, agency, salary, _additional, deadline, _status = cells
        m = _LINK_RE.match(title_md)
        if not m:
            continue
        title = _clean_title(m.group(1))
        url = m.group(2)
        rows.append({
            "title": title, "employer": sanitize_text(agency),
            "location_text": "Santa Cruz County", "city": "Santa Cruz", "url": url,
            "date_posted": "",
            "salary_text": sanitize_text(salary), "benefits_text": "",
            "hours_text": "",
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
            "application_deadline": sanitize_text(deadline),
        })
    return rows
