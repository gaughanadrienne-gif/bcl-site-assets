"""Parser for NEOGOV/governmentjobs.com/schooljobs.com markdown listing pages.

The captured markdown page includes a clean pipe-delimited table:
| Job Title | Job Type | Salary | Closing | Posted | Category | Department | Location | Job Number |
That table is the reliable extraction target (the earlier card-list section
on the same page repeats the same data in a much messier shape).
"""

import re

from shared.bcl_ingest import sanitize_text

_LINK_RE = re.compile(r"^\[([^\]]+)\]\(([^)\s]+)\)")
_ZIP_RE = re.compile(r"\b(\d{5})\b")

# Local Santa Cruz County zip -> city, for geography classification.
_ZIP_CITY = {
    "95006": "Boulder Creek", "95005": "Ben Lomond", "95018": "Felton",
    "95041": "Mount Hermon", "95066": "Scotts Valley", "95060": "Santa Cruz",
    "95062": "Santa Cruz", "95065": "Santa Cruz", "95076": "Watsonville",
    "95003": "Aptos", "95010": "Capitola", "95073": "Soquel",
    "95030": "Los Gatos",
}


def _to_iso_date(mmddyy):
    m = re.match(r"^(\d{2})/(\d{2})/(\d{2})$", mmddyy.strip())
    if not m:
        return ""
    mm, dd, yy = m.groups()
    return "20%s-%s-%s" % (yy, mm, dd)


def _split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse(markdown, source):
    rows = []
    for line in markdown.splitlines():
        line = line.strip()
        if not line.startswith("| [") or "/jobs/" not in line or "---" in line:
            continue
        cells = _split_row(line)
        if len(cells) != 9:
            continue
        title_md, job_type, salary, closing, posted, category, department, location, _job_number = cells
        m = _LINK_RE.match(title_md)
        if not m:
            continue
        title = sanitize_text(m.group(1))
        url = m.group(2)
        zip_match = _ZIP_RE.search(location)
        postal_code = zip_match.group(1) if zip_match else ""
        city = _ZIP_CITY.get(postal_code, "")
        rows.append({
            "title": title, "employer": sanitize_text(department),
            "location_text": location, "city": city, "url": url,
            "date_posted": _to_iso_date(posted),
            "salary_text": sanitize_text(salary), "benefits_text": "",
            "hours_text": sanitize_text(job_type),
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
            "postal_code": postal_code,
            "application_deadline": sanitize_text(closing),
            "category": sanitize_text(category),
        })
    return rows
