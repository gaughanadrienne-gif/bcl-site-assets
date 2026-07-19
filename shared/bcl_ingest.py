"""Core ingest helpers shared by the jobs and rentals refresh pipelines."""

import hashlib
import html
import json
import os
import re
from urllib.parse import urlsplit, urlunsplit

_TAG_RE = re.compile(r"<[^>]+>")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def sanitize_text(value):
    """Strip HTML tags/entities and collapse whitespace to a single-line string."""
    if value is None:
        return ""
    text = _TAG_RE.sub(" ", str(value))
    text = html.unescape(text)
    text = text.replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def make_slug(*parts):
    """Build a url-safe slug from the given parts; 'item' if everything is empty."""
    joined = " ".join(str(p) for p in parts if p).lower()
    slug = _SLUG_RE.sub("-", joined).strip("-")
    return slug or "item"


def normalize_url(url):
    """Drop the query string (tracking) but keep path and fragment (SPA routes)."""
    if not url:
        return ""
    parts = urlsplit(str(url).strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", parts.fragment))


def record_fingerprint(values):
    """Stable 40-char hex fingerprint from normalized field values (order matters)."""
    norm = "|".join(sanitize_text(v).lower() for v in values)
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def dedupe_by(records, keyfn):
    """Return records unique by keyfn(record), keeping the first occurrence."""
    seen = set()
    out = []
    for rec in records:
        key = keyfn(rec)
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    return out


_COMMUTE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "commute_table.json")
_COMMUTE_CACHE = None


def _commute_table():
    global _COMMUTE_CACHE
    if _COMMUTE_CACHE is None:
        with open(_COMMUTE_PATH, encoding="utf-8") as fh:
            _COMMUTE_CACHE = json.load(fh)
    return _COMMUTE_CACHE


def classify_geo(city):
    """Return the geography tier for a work city: core, extended, or unknown."""
    row = _commute_table().get((city or "").strip())
    return row["tier"] if row else "unknown"


def commute_minutes(city):
    """Approximate drive minutes from Boulder Creek for a work city, or None."""
    row = _commute_table().get((city or "").strip())
    return row["minutes"] if row else None
