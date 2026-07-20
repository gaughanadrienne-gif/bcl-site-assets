"""Parser for Workday CxS JSON (`/wday/cxs/<tenant>/<site>/jobs` POST response).

Each posting in `data["jobPostings"]` looks like:
    {"title": ..., "externalPath": "/job/US-CA-Scotts-Valley/...",
     "locationsText": "US CA, Scotts Valley", "postedOn": "Posted 5 Days Ago"}

`locationsText` is either "{country abbrev} {state}, {City}" (single site) or
"N Locations" (multi-site rollup, no usable city -- left empty so the geo
gate routes it to review rather than guessing).
"""

import re

from shared.bcl_ingest import parse_relative_date, sanitize_text

_MULTI_LOCATIONS_RE = re.compile(r"^\d+\s+Locations?$", re.I)
_CA_STATE_RE = re.compile(r"(?:^|\s)CA(?:\s|,|$)", re.I)


def _city_from_locations_text(locations_text):
    text = (locations_text or "").strip()
    if not text or _MULTI_LOCATIONS_RE.match(text):
        return ""
    if "," not in text:
        return ""
    state_part = text.rsplit(",", 1)[0].strip()
    if not _CA_STATE_RE.search(state_part):
        return ""
    return text.rsplit(",", 1)[-1].strip()


def parse(data, source):
    config = source.get("config") or {}
    host = config.get("host", "").rstrip("/")
    site = config.get("site", "")
    today = source.get("_today", "")

    rows = []
    for posting in data.get("jobPostings", []):
        title = sanitize_text(posting.get("title", ""))
        external_path = posting.get("externalPath", "") or ""
        locations_text = sanitize_text(posting.get("locationsText", ""))
        url = "%s/en-US/%s%s" % (host, site, external_path) if host else ""
        rows.append({
            "title": title, "employer": sanitize_text(source.get("name", "")),
            "location_text": locations_text, "city": _city_from_locations_text(locations_text),
            "url": url,
            "date_posted": parse_relative_date(posting.get("postedOn", ""), today) if today else "",
            "salary_text": "", "benefits_text": "", "hours_text": "",
            "description": "", "work_mode": "on-site", "remote": False,
            "eligibility_text": "",
        })
    return rows
