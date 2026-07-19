"""Parser for RSS job feeds. Two styles, selected via source['config']['style']:

- "wwr": remote boards where <title> is "Company: Title" and eligibility comes
  from <region>/<country>/<state> tags (We Work Remotely).
- "employer" (default): a single-employer feed (e.g. Second Harvest) where
  <title> is "Title  (State, City)" and salary is mined from <description>.
"""

import re
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

from shared.bcl_ingest import is_ca_eligible, sanitize_text

_SALARY_RE = re.compile(r"\$[\d,]+(?:\.\d+)?\s*-\s*\$?[\d,]+(?:\.\d+)?|\$[\d,]+(?:\.\d+)?")
_TITLE_LOC_RE = re.compile(r"^(?P<title>.*?)\s*\(\s*(?P<state>[^,)]+)\s*,\s*(?P<city>[^)]+)\)\s*$")


def _localname(tag):
    return tag.rsplit("}", 1)[-1]


def _child_text(item, name):
    for child in item:
        if _localname(child.tag) == name:
            return (child.text or "").strip()
    return ""


def _to_iso_date(pub_date):
    if not pub_date:
        return ""
    try:
        return parsedate_to_datetime(pub_date).date().isoformat()
    except (TypeError, ValueError):
        return ""


def parse(xml_text, source):
    style = (source.get("config") or {}).get("style", "employer")
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    if style == "wwr":
        return [row for row in (_parse_wwr_item(item) for item in items) if row]
    return [row for row in (_parse_employer_item(item, source) for item in items) if row]


def _parse_wwr_item(item):
    raw_title = _child_text(item, "title")
    if ":" in raw_title:
        employer, title = raw_title.split(":", 1)
    else:
        employer, title = "", raw_title
    employer = sanitize_text(employer)
    title = sanitize_text(title)
    region = _child_text(item, "region")
    country = _child_text(item, "country")
    state = _child_text(item, "state")
    eligibility_text = " ".join(x for x in (region, country, state) if x)
    if not is_ca_eligible(eligibility_text):
        return None
    url = _child_text(item, "link") or _child_text(item, "guid")
    return {
        "title": title, "employer": employer,
        "location_text": eligibility_text, "city": "", "url": url,
        "date_posted": _to_iso_date(_child_text(item, "pubDate")),
        "salary_text": "", "benefits_text": "", "hours_text": _child_text(item, "type"),
        "description": sanitize_text(_child_text(item, "description")),
        "work_mode": "remote", "remote": True, "eligibility_text": eligibility_text,
    }


def _parse_employer_item(item, source):
    raw_title = _child_text(item, "title")
    m = _TITLE_LOC_RE.match(raw_title)
    if m:
        title = sanitize_text(m.group("title"))
        city = sanitize_text(m.group("city"))
        state = sanitize_text(m.group("state"))
        location_text = "%s, %s" % (state, city)
    else:
        title = sanitize_text(raw_title)
        city = ""
        location_text = ""
    description = sanitize_text(_child_text(item, "description"))
    salary_match = _SALARY_RE.search(description)
    salary_text = salary_match.group(0) if salary_match else ""
    url = _child_text(item, "link") or _child_text(item, "guid")
    return {
        "title": title, "employer": (source.get("config") or {}).get("employer", ""),
        "location_text": location_text, "city": city, "url": url,
        "date_posted": _to_iso_date(_child_text(item, "pubDate")),
        "salary_text": salary_text, "benefits_text": "", "hours_text": "",
        "description": description,
        "work_mode": "on-site", "remote": False, "eligibility_text": "",
    }
