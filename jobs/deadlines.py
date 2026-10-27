"""Explicit application closing days. Unknown/open-ended deadlines never expire.

Date-only source deadlines remain active through that calendar day in Pacific
 time. Never infer closure from posting age, source absence or a vague label.
"""
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo


def pacific_today():
    return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()


def deadline_day(value):
    raw = str(value or "").strip()
    match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[T\s])", raw)
    if match:
        parts = tuple(map(int, match.groups()))
    else:
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?=$|\s)", raw)
        if match:
            month, day, year = map(int, match.groups())
            parts = (year + 2000 if year < 100 else year, month, day)
        else:
            match = re.match(r"^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?=$|\s)", raw)
            if not match:
                return None
            months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
            try:
                month = months.index(match[1].lower()) + 1
            except ValueError:
                return None
            parts = (int(match[3]), month, int(match[2]))
    try:
        return date(*parts).isoformat()
    except ValueError:
        return None


def job_is_expired(job, today=None):
    day = deadline_day(job.get("application_deadline"))
    return day is not None and day < (today or pacific_today())
