"""Parser for NEOGOV/governmentjobs.com/schooljobs.com markdown listing pages.

The captured markdown page includes a clean pipe-delimited table, which is the
reliable extraction target (the card-list section on the same page repeats the
same data in a much messier shape).

**THE COLUMN COUNT VARIES BY AGENCY. Never index this table positionally.**
Measured 2026-07-28:

  City of Scotts Valley   9 cols  Title|Type|Salary|Closing|Posted|Category|Department|Location|Number
  City of Santa Cruz     10 cols  ...the same, plus a trailing "Remote"
  Cabrillo College        7 cols  Title|Type|Posted|Closing|Location|Number|Remote
                                  (no Salary, no Category, no Department)

The previous version required exactly 9 cells and silently skipped every row
otherwise, so Santa Cruz (14 live jobs) and Cabrillo (4) contributed **zero**
while Scotts Valley worked fine on the same code path. That is why this reads
by HEADER NAME: a new agency with an extra column keeps working, and a missing
column yields an empty field instead of dropping the whole row.
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

# Header label -> the field we want it in. Lower-cased comparison.
_COLUMNS = {
    "job title": "title",
    "job type": "job_type",
    "salary": "salary",
    "closing": "closing",
    "posted": "posted",
    "category": "category",
    "department": "department",
    "location": "location",
    "job number": "job_number",
    "remote": "remote",
}


def _to_iso_date(mmddyy):
    m = re.match(r"^(\d{2})/(\d{2})/(\d{2})$", (mmddyy or "").strip())
    if not m:
        return ""
    mm, dd, yy = m.groups()
    return "20%s-%s-%s" % (yy, mm, dd)


def _split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _header_map(line):
    """Return {field: index} from a header row, or None if it is not one."""
    mapping = {}
    for i, cell in enumerate(_split_row(line)):
        key = _COLUMNS.get(cell.strip().lower())
        if key:
            mapping[key] = i
    # "Job Title" alone is enough to identify the table header
    return mapping if "title" in mapping else None


def parse(markdown, source):
    rows = []
    cols = None
    for line in (markdown or "").splitlines():
        line = line.strip()
        if not line.startswith("|") or "---" in line:
            continue

        if "/jobs/" not in line:
            found = _header_map(line)
            if found:
                cols = found
            continue

        if cols is None or not line.startswith("| ["):
            continue

        cells = _split_row(line)

        def col(field):
            i = cols.get(field)
            return cells[i] if i is not None and i < len(cells) else ""

        m = _LINK_RE.match(col("title"))
        if not m:
            continue

        location = col("location")
        zip_match = _ZIP_RE.search(location)
        postal_code = zip_match.group(1) if zip_match else ""
        rows.append({
            "title": sanitize_text(m.group(1)),
            # Cabrillo publishes no Department column; fall back to the agency
            # name rather than emitting a blank employer.
            "employer": sanitize_text(col("department")) or sanitize_text(source.get("name", "")),
            "location_text": location,
            "city": _ZIP_CITY.get(postal_code, ""),
            "url": m.group(2),
            "date_posted": _to_iso_date(col("posted")),
            "salary_text": sanitize_text(col("salary")),
            "benefits_text": "",
            "hours_text": sanitize_text(col("job_type")),
            "description": "",
            "work_mode": "on-site",
            "remote": False,
            "eligibility_text": "",
            "postal_code": postal_code,
            "application_deadline": sanitize_text(col("closing")),
            "category": sanitize_text(col("category")),
        })
    return rows
