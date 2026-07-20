"""Jobs refresh orchestration: fetch each enabled source, parse, normalize,
split into publish/queue, dedupe, and write data/jobs.json via the guarded
writer so a broken run never blanks the live board.

Fetchers are injected (see build_jobs) so this whole pipeline is testable
offline against the captured fixtures; only main() touches the network.
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import (  # noqa: E402
    dedupe_by, firecrawl_markdown, http_get, http_json, load_manual_entries,
    normalize_url, record_fingerprint, write_json_atomic, write_public_json_guarded,
)
from shared.review_board import render_review_board  # noqa: E402
from jobs.normalize import include_job, normalize_job  # noqa: E402
from jobs.parsers import edjoin, jobaps, neogov, remote_json, rss  # noqa: E402
from jobs.sources import JOB_SOURCES  # noqa: E402

PUBLIC_SCHEMA_KEYS = (
    "id", "slug", "title", "title_original", "employer_name", "description_summary",
    "employment_type", "work_mode", "remote_regions", "city", "state", "postal_code",
    "location_precision", "geography_tier", "commute_minutes", "commute_type",
    "salary_min", "salary_max", "salary_period", "salary_text", "salary_disclosed",
    "benefits_text", "hours_text", "schedule", "category", "posted_at",
    "application_deadline", "canonical_url", "source", "first_seen_at",
    "last_verified_at", "verification_status", "freshness_label",
)

PARSERS = {
    "neogov": neogov.parse,
    "jobaps": jobaps.parse,
    "edjoin": edjoin.parse,
    "rss": rss.parse,
    "remote_json": remote_json.parse,
}

# Platform -> fetch strategy. Anything not listed here (Workday POST-JSON,
# iCIMS/Dayforce/Paycom/Paylocity/ADP/Oracle employer widgets) falls back to
# a markdown scrape; those parsers are not yet built (see plan self-review),
# so build_jobs will simply find no PARSERS entry and skip the source.
_MARKDOWN_PLATFORMS = {"neogov", "jobaps", "edjoin", "calopps", "custom_html",
                        "icims", "dayforce", "paycom", "paylocity", "adp",
                        "oracle", "phenom", "peoplesoft", "taleo"}

MIN_SAFE_TOTAL = 5

_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_ROOT_DIR, "data")
_REVIEW_DIR = os.path.join(_ROOT_DIR, "review")
_PARTIALS_DIR = os.path.join(_ROOT_DIR, "partials")
JOBS_PATH = os.path.join(_DATA_DIR, "jobs.json")
QUEUE_PATH = os.path.join(_REVIEW_DIR, "jobs-pending.json")
REVIEW_BOARD_PATH = os.path.join(_REVIEW_DIR, "review-board.html")
MANUAL_JOBS_PATH = os.path.join(_PARTIALS_DIR, "manual-jobs.json")
MANUAL_TTL_DAYS = 30


def fetch_raw(source, http_get_fn, http_json_fn, firecrawl_markdown_fn):
    """Dispatch a source's fetch by platform. Fetchers are injected for tests."""
    platform = source.get("platform", "")
    if platform == "remote_json":
        return http_json_fn(source["url"])
    if platform == "rss":
        return http_get_fn(source["url"])
    if platform in _MARKDOWN_PLATFORMS:
        return firecrawl_markdown_fn(source["url"])
    # Unknown platform (e.g. workday POST-json, not yet implemented): let the
    # caller's per-source try/except catch this and skip cleanly.
    raise RuntimeError("no fetch strategy for platform %r" % platform)


_MANUAL_SOURCE = {"name": "Community submission"}


def build_jobs(sources, fetchers, today, manual_path=MANUAL_JOBS_PATH):
    """Fetch+parse+normalize every ENABLED source; return (published, queued).

    `fetchers` is a dict with http_get/http_json/firecrawl_markdown callables
    (injected so this is fully testable against fixtures, offline). A
    per-source exception is logged and skipped -- it never aborts the run.

    Owner-approved submissions in `manual_path` (see `load_manual_entries`)
    are merged in as if they were another source: they run through the exact
    same `normalize_job`/`include_job` gates, so a submission can never
    bypass the geography/exclusion checks that scraped rows go through.
    """
    http_get_fn = fetchers.get("http_get", http_get)
    http_json_fn = fetchers.get("http_json", http_json)
    firecrawl_fn = fetchers.get("firecrawl_markdown", firecrawl_markdown)

    published = []
    queued = []
    for source in sources:
        if not source.get("enabled"):
            continue
        parser_fn = PARSERS.get(source.get("parser"))
        if parser_fn is None:
            continue  # not yet onboarded (registry-ready, parser pending)
        try:
            raw_data = fetch_raw(source, http_get_fn, http_json_fn, firecrawl_fn)
            raw_rows = parser_fn(raw_data, source)
        except Exception as exc:  # noqa: BLE001 -- a broken source must never abort the run
            print("refresh_jobs: source %r failed: %s" % (source.get("name"), exc), file=sys.stderr)
            continue

        for raw in raw_rows:
            try:
                job = normalize_job(raw, source, today)
                ok, reason = include_job(job)
                if ok:
                    published.append(job)
                else:
                    job = dict(job)
                    job["_queue_reason"] = reason
                    queued.append(job)
            except Exception as exc:  # noqa: BLE001 -- one bad row must not drop the source
                print(
                    "refresh_jobs: row from source %r failed: %s" % (source.get("name"), exc),
                    file=sys.stderr,
                )
                continue

    for raw in load_manual_entries(manual_path, today, MANUAL_TTL_DAYS):
        try:
            job = normalize_job(raw, _MANUAL_SOURCE, today)
            ok, reason = include_job(job)
            if ok:
                published.append(job)
            else:
                job = dict(job)
                job["_queue_reason"] = reason
                queued.append(job)
        except Exception as exc:  # noqa: BLE001 -- one bad submission must not drop the rest
            print("refresh_jobs: manual submission failed: %s" % exc, file=sys.stderr)
            continue

    published = dedupe_by(published, lambda j: normalize_url(j["canonical_url"]) or j["id"])
    published = dedupe_by(
        published, lambda j: record_fingerprint([j["title"], j["employer_name"], j["city"]])
    )
    return published, queued


def _pacific_today():
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:  # noqa: BLE001 -- tzdata may be unavailable on some hosts
        return date.today().isoformat()


def main():
    today = _pacific_today()
    published, queued = build_jobs(
        JOB_SOURCES,
        {"http_get": http_get, "http_json": http_json, "firecrawl_markdown": firecrawl_markdown},
        today,
    )
    write_public_json_guarded(
        JOBS_PATH, key="jobs", records=published, min_total=MIN_SAFE_TOTAL,
        note="Boulder Creek Local jobs board. Auto-refreshed; see refresh_jobs.py.",
        today=today,
    )
    write_json_atomic(QUEUE_PATH, {
        "_note": "Jobs awaiting owner review (ambiguous location, excluded keyword, or missing fields).",
        "updated": today, "count": len(queued), "jobs": queued,
    })
    review_items = [
        {
            "id": job.get("id"), "title": job.get("title"),
            "subtitle": "%s -- %s (%s)" % (job.get("employer_name", ""), job.get("city", ""),
                                            job.get("_queue_reason", "")),
            "detail": job.get("description_summary", ""),
            "url": job.get("canonical_url", ""),
        }
        for job in queued
    ]
    render_review_board(review_items, "jobs", REVIEW_BOARD_PATH)
    print("refresh_jobs: published=%d queued=%d" % (len(published), len(queued)))


if __name__ == "__main__":
    main()
