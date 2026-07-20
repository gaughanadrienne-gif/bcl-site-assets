"""Rentals refresh orchestration: fetch each enabled source, parse, normalize,
gate publish/queue/reject, run the safety gates over publish candidates,
dedupe, and write data/rentals.json via the tiny-inventory-safe guard.

Fetchers are injected (see build_rentals) so this whole pipeline is testable
offline against the captured fixtures; only main() touches the network. All
enabled rentals sources are scraped as firecrawl markdown.
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import (  # noqa: E402
    dedupe_by, firecrawl_markdown, normalize_url, record_fingerprint,
    write_json_atomic, write_rentals_guarded,
)
from shared.review_board import render_review_board  # noqa: E402
from rentals.normalize import include_rental, normalize_rental  # noqa: E402
from rentals.parsers import appfolio, custom_html, rentvine  # noqa: E402
from rentals.safety import safety_status  # noqa: E402
from rentals.sources import RENTAL_SOURCES  # noqa: E402

PUBLIC_SCHEMA_KEYS = (
    "id", "slug", "headline", "property_type", "rental_scope", "address_public",
    "city", "state", "postal_code", "location_precision", "monthly_rent",
    "total_monthly_price", "deposit", "application_fee", "bedrooms", "bathrooms",
    "square_feet", "available_date", "lease_term", "minimum_stay_days",
    "furnished", "pets_policy", "utilities_text", "parking_text", "laundry_text",
    "description_summary", "canonical_url", "source", "property_manager",
    "first_seen_at", "last_verified_at", "verification_status", "freshness_label",
)

PARSERS = {
    "rentvine": rentvine.parse,
    "appfolio": appfolio.parse,
    "custom_html": custom_html.parse,
}

# All rentals sources are scraped via firecrawl markdown (see plan self-review
# -- the AppFolio JS-render/JSON-endpoint hardening is a follow-up).
MIN_SAFE_TOTAL = 0  # no count floor for rentals; see write_rentals_guarded

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_REVIEW_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "review")
RENTALS_PATH = os.path.join(_DATA_DIR, "rentals.json")
QUEUE_PATH = os.path.join(_REVIEW_DIR, "rentals-pending.json")
REVIEW_BOARD_PATH = os.path.join(_REVIEW_DIR, "review-board.html")


def fetch_raw(source, fetchers):
    """All rentals sources are scraped as firecrawl markdown."""
    firecrawl_fn = fetchers.get("firecrawl_markdown", firecrawl_markdown)
    return firecrawl_fn(source["url"])


def build_rentals(sources, fetchers, today):
    """Fetch+parse+normalize every ENABLED source; return (published, queued, had_errors).

    `fetchers` is a dict with a firecrawl_markdown callable (injected so this
    is fully testable against fixtures, offline). A per-source exception sets
    had_errors=True and is skipped -- it never aborts the run.
    """
    published = []
    queued = []
    had_errors = False

    for source in sources:
        if not source.get("enabled"):
            continue
        parser_fn = PARSERS.get(source.get("parser"))
        if parser_fn is None:
            continue  # not yet onboarded (registry-ready, parser pending)
        try:
            raw_data = fetch_raw(source, fetchers)
            raw_rows = parser_fn(raw_data, source)
            for raw in raw_rows:
                rental = normalize_rental(raw, source, today)
                status, reason = include_rental(rental)
                if status == "publish":
                    ok, safety_reasons = safety_status(rental)
                    if not ok:
                        rental = dict(rental)
                        rental["_queue_reason"] = "; ".join(safety_reasons)
                        queued.append(rental)
                        continue
                    published.append(rental)
                elif status == "queue":
                    rental = dict(rental)
                    rental["_queue_reason"] = reason
                    queued.append(rental)
                # "reject" -> dropped entirely
        except Exception as exc:  # noqa: BLE001 -- a broken source must never abort the run
            had_errors = True
            print("refresh_rentals: source %r failed: %s" % (source.get("name"), exc), file=sys.stderr)
            continue

    published = dedupe_by(published, lambda r: normalize_url(r["canonical_url"]) or r["id"])
    published = dedupe_by(
        published, lambda r: record_fingerprint([r["address_public"], r["city"]])
    )
    return published, queued, had_errors


def _pacific_today():
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:  # noqa: BLE001 -- tzdata may be unavailable on some hosts
        return date.today().isoformat()


def main():
    today = _pacific_today()
    published, queued, had_errors = build_rentals(
        RENTAL_SOURCES, {"firecrawl_markdown": firecrawl_markdown}, today,
    )
    write_rentals_guarded(
        RENTALS_PATH, published,
        note="Boulder Creek Local rentals board. Auto-refreshed; see refresh_rentals.py.",
        today=today, had_errors=had_errors,
    )
    write_json_atomic(QUEUE_PATH, {
        "_note": "Rentals awaiting owner review (undisclosed address, safety flag, or ambiguous location).",
        "updated": today, "count": len(queued), "rentals": queued,
    })
    review_items = [
        {
            "id": rental.get("id"), "title": rental.get("headline"),
            "subtitle": "%s -- %s (%s)" % (rental.get("property_manager", ""), rental.get("city", ""),
                                            rental.get("_queue_reason", "")),
            "detail": rental.get("description_summary", ""),
            "url": rental.get("canonical_url", ""),
        }
        for rental in queued
    ]
    render_review_board(review_items, "rentals", REVIEW_BOARD_PATH)
    print("refresh_rentals: published=%d queued=%d had_errors=%s" % (len(published), len(queued), had_errors))


if __name__ == "__main__":
    main()
