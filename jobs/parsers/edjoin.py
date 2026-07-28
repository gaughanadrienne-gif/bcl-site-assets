"""Parser for EDJOIN (edjoin.org), reading its own JSON endpoint.

WHY JSON AND NOT MARKDOWN (rewritten 2026-07-28)
EDJOIN renders job rows client-side from an Underscore template, so the scraped
page contains no listings. Firecrawl began returning EDJOIN's "ATTENTION:
Important Notice" cache-clearing interstitial instead of the board, the old
regex matched nothing, and **an empty parse is not an error** -- so six enabled
Santa Cruz County district sources silently contributed zero for an unknown
number of weeks while 84 local openings sat unpublished.

EDJOIN's own page calls this, and it needs no rendering and no special headers:

    GET /Home/LoadJobs?rows=..&page=1&sort=postingDate&sortVal=0&order=desc
        &keywords=&location=&searchType=all&regions=<countyID>&jobTypes=&days=0
        &empType=&catID=0&onlineApps=&recruitmentCenterID=0&stateID=0
        &regionID=0&districtID=<id>&searchID=0

Two parameters matter and are easy to confuse:
  * `regions`  = COUNTY id. `regions=44` returns every Santa Cruz County
    posting in one call, across all districts, which is what we use.
  * `regionID` is NOT a county filter. `regionID=44` returns statewide results.

Response: {"data": [...], "totalRecords": N, "totalPages": N, ...}
"""

import datetime
import re

from shared.bcl_ingest import sanitize_text

# EDJOIN serves .NET dates as /Date(epoch_millis)/
_DOTNET_DATE = re.compile(r"/Date\((-?\d+)\)/")


def _iso_date(value):
    """'/Date(1784592000000)/' -> '2026-07-20'. Empty string if absent or
    sentinel (EDJOIN uses /Date(-62135568000000)/ for 'not set')."""
    if not value:
        return ""
    m = _DOTNET_DATE.search(str(value))
    if not m:
        return ""
    millis = int(m.group(1))
    if millis <= 0:  # .NET DateTime.MinValue sentinel
        return ""
    try:
        return datetime.datetime.fromtimestamp(
            millis / 1000.0, datetime.timezone.utc).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return ""


def _salary_text(row):
    """EDJOIN splits pay across several shapes. Build one readable line, and
    return '' rather than inventing a number when nothing is published."""
    unit = sanitize_text(row.get("PayRangeDropdown") or row.get("SingleRateDropdown") or "")
    lo = sanitize_text(row.get("PayRangeFrom") or "")
    hi = sanitize_text(row.get("PayRangeTo") or "")
    single = sanitize_text(row.get("SingleRate") or "")
    info = sanitize_text(row.get("salaryInfo") or "")
    if lo and hi:
        base = "%s - %s" % (lo, hi)
    elif single:
        base = single
    elif lo or hi:
        base = lo or hi
    else:
        return info
    return ("%s %s" % (base, unit)).strip() if unit else base


def _deadline(row):
    """'Until Filled' and 'Continuous' are displayFlag values, not dates."""
    flag = sanitize_text(row.get("displayFlag") or "")
    if flag:
        return flag
    return _iso_date(row.get("displayUntil"))


def parse(payload, source):
    """`payload` is the decoded JSON dict from http_json."""
    if isinstance(payload, dict):
        rows_in = payload.get("data") or []
    elif isinstance(payload, list):
        rows_in = payload
    else:
        return []

    rows = []
    for row in rows_in:
        if not isinstance(row, dict):
            continue
        title = sanitize_text(row.get("positionTitle") or "")
        posting_id = row.get("postingID")
        if not title or not posting_id:
            continue  # a row we cannot link to is not publishable

        employer = sanitize_text(row.get("districtName") or "")
        city = sanitize_text(row.get("city") or "")
        county = sanitize_text(row.get("countyName") or "")
        location_text = ", ".join([p for p in (city, county) if p])

        rows.append({
            "title": title,
            "employer": employer,
            "location_text": location_text or employer,
            "city": city,
            "url": "https://www.edjoin.org/Home/JobPosting/%s" % posting_id,
            "date_posted": _iso_date(row.get("postingDate")) or _iso_date(row.get("CreationDate")),
            "salary_text": _salary_text(row),
            "benefits_text": "",
            # FullTimePartTime is the only hours signal EDJOIN exposes here.
            "hours_text": sanitize_text(row.get("FullTimePartTime") or ""),
            "description": sanitize_text(row.get("JobSummary") or ""),
            # School district work is on-site by definition; EDJOIN has no
            # remote flag and inventing one would be worse than omitting it.
            "work_mode": "on-site",
            "remote": False,
            "eligibility_text": sanitize_text(row.get("jobType") or ""),
            "application_deadline": _deadline(row),
        })
    return rows
