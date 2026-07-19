"""Core ingest helpers shared by the jobs and rentals refresh pipelines."""

import hashlib
import html
import json
import os
import re
import time
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


_ZIP_95006_RE = re.compile(r"\b95006\b")


def is_95006(rec):
    """True only when a record is confirmably in ZIP 95006.

    Evidence = an exact postal_code of 95006, or 95006 appearing in a structured
    address field. A bare "Boulder Creek" label or a ZIP mentioned only in prose
    is NOT sufficient (search pages bleed into 95005/95007/95018).
    """
    if str(rec.get("postal_code", "")).strip() == "95006":
        return True
    for field in ("address_public", "address_normalized"):
        if _ZIP_95006_RE.search(str(rec.get(field, "") or "")):
            return True
    return False


class DetailCache:
    """Per-URL cache of detail-page verdicts (pay/benefits/hours), with a TTL so
    stale 'no data' verdicts get rechecked. Machine-local; never published."""

    def __init__(self, path, ttl_days=7, now=None):
        self.path = path
        self.ttl = ttl_days * 86400
        self._now = now or time.time
        self.data = {}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as fh:
                    self.data = json.load(fh)
            except (ValueError, OSError):
                self.data = {}

    def get(self, url):
        entry = self.data.get(url)
        if not entry:
            return None
        if self._now() - entry.get("ts", 0) > self.ttl:
            return None
        return entry.get("value")

    def set(self, url, value):
        self.data[url] = {"ts": self._now(), "value": value}

    def save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh)
        os.replace(tmp, self.path)


class GuardError(Exception):
    """Raised when a run produces too few records to safely overwrite live data."""


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def write_public_json_guarded(path, key, records, min_total, note, today):
    """Write the public payload only when it clears the safety floor.

    A broken scrape must never blank or shrink the live board: if fewer than
    min_total records were produced, raise GuardError WITHOUT touching the file,
    so the .bat wrapper sees a nonzero exit and skips the commit/push.
    """
    if len(records) < min_total:
        raise GuardError(
            "refusing to write %s: %d records < MIN_SAFE_TOTAL %d"
            % (path, len(records), min_total)
        )
    payload = {"_note": note, "updated": today, "count": len(records), key: records}
    write_json_atomic(path, payload)
    return payload
