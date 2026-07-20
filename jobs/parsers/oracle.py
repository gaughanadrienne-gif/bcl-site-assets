"""Parser for Oracle Recruiting Cloud (CE) REST search JSON.

Each requisition in `data["items"][0]["requisitionList"]` looks like:
    {"Id": "735936", "Title": "Deli Associate",
     "PrimaryLocation": "Los Gatos, CA, United States",
     "PostedDate": "2026-07-13", "ShortDescriptionStr": "...",
     "WorkplaceType": ""}
"""

from shared.bcl_ingest import sanitize_text


def _city_from_primary_location(primary_location):
    """PrimaryLocation is "City, ST, Country" -- only accept the city when
    the 2nd comma-segment is the CA state code, so a same-named city in
    another state (e.g. "Santa Clara, UT, United States") never leaks in."""
    text = (primary_location or "").strip()
    if not text:
        return ""
    parts = [p.strip() for p in text.split(",")]
    if len(parts) < 2 or parts[1].upper() != "CA":
        return ""
    return parts[0]


def parse(data, source):
    config = source.get("config") or {}
    job_url_pattern = config.get("job_url")
    fallback_url = source.get("url", "") or ""

    items = data.get("items") or []
    requisitions = items[0].get("requisitionList", []) if items else []

    rows = []
    for req in requisitions:
        title = sanitize_text(req.get("Title", ""))
        primary_location = sanitize_text(req.get("PrimaryLocation", ""))
        city = _city_from_primary_location(primary_location)
        req_id = req.get("Id", "") or ""
        url = job_url_pattern.format(id=req_id) if job_url_pattern else fallback_url
        workplace_type = req.get("WorkplaceType", "") or ""
        remote = "remote" in workplace_type.lower()
        rows.append({
            "title": title, "employer": sanitize_text(source.get("name", "")),
            "location_text": primary_location, "city": city, "url": url,
            "date_posted": sanitize_text(req.get("PostedDate", "")),
            "salary_text": "", "benefits_text": "", "hours_text": "",
            "description": sanitize_text(req.get("ShortDescriptionStr", "")),
            "work_mode": "remote" if remote else "on-site", "remote": remote,
            "eligibility_text": "",
        })
    return rows
