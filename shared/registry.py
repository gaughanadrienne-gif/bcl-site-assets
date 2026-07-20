"""Source-registry schema, enums, and validation for the jobs & rentals tools."""

COLLECTION_CLASSES = frozenset({
    "api_authorized", "feed_authorized", "direct_page_reviewed", "email_alert",
    "submission", "manual_review", "discovery_only", "disabled",
})

KNOWN_PARSERS = frozenset({
    "neogov", "edjoin", "jobaps", "calopps", "workday", "icims", "dayforce",
    "paycom", "paylocity", "adp", "oracle", "avature", "saashr", "talentreef",
    "phenom", "peoplesoft", "taleo", "rss", "remote_json", "appfolio", "rentvine",
    "custom_html", "discovery", "submission",
})

REQUIRED_FIELDS = (
    "name", "tool", "collection_class", "platform", "parser", "url",
    "geo", "priority", "enabled", "terms_ok",
)


class RegistryError(Exception):
    """Raised when a source registry entry is malformed or violates the gate."""


def _check(source):
    name = source.get("name", "<unnamed>")
    for field in REQUIRED_FIELDS:
        if field not in source:
            raise RegistryError("source %r missing required field %r" % (name, field))
    if source["tool"] not in ("jobs", "rentals"):
        raise RegistryError("source %r has bad tool %r" % (name, source["tool"]))
    if source["collection_class"] not in COLLECTION_CLASSES:
        raise RegistryError("source %r has bad collection_class %r" % (name, source["collection_class"]))
    if source["parser"] not in KNOWN_PARSERS:
        raise RegistryError("source %r has unknown parser %r" % (name, source["parser"]))
    if not str(source["url"]).startswith("http"):
        raise RegistryError("source %r url must be http(s): %r" % (name, source["url"]))
    if source["enabled"]:
        if not source["terms_ok"]:
            raise RegistryError("source %r is enabled but terms_ok is False (onboarding gate)" % name)
        if source["collection_class"] in ("discovery_only", "disabled"):
            raise RegistryError("source %r is enabled but collection_class is %r" % (name, source["collection_class"]))


def validate_registry(sources):
    """Validate every source; ensure names are unique. Return the list unchanged."""
    seen = set()
    for source in sources:
        _check(source)
        if source["name"] in seen:
            raise RegistryError("duplicate source name %r" % source["name"])
        seen.add(source["name"])
    return sources
