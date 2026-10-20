"""Shared recruitment URL identity for refresh and reviewed-field guards."""
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def job_identity_url(url):
    """Retain requisition query IDs; remove only recognized tracking fields."""
    parts = urlsplit(str(url or "").strip())
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_")
             and key.lower() not in {"fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"}]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"),
                       urlencode(sorted(query)), parts.fragment))
