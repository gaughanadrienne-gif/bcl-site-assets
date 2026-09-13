"""Jobs refresh orchestration: fetch each enabled source, parse, normalize,
split into publish/queue, dedupe, and write data/jobs.json via the guarded
writer so a broken run never blanks the live board.

Fetchers are injected (see build_jobs) so this whole pipeline is testable
offline against the captured fixtures; only main() touches the network.
"""

import os
import sys
from datetime import date
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import (  # noqa: E402
    dedupe_by, firecrawl_markdown, http_get, http_json, http_post_json, load_manual_entries,
    load_json, write_json_atomic, write_public_json_guarded,
)
from shared.review_board import render_review_board  # noqa: E402
from jobs.normalize import include_job, normalize_job  # noqa: E402
from jobs.parsers import (  # noqa: E402
    calopps, dayforce, edjoin, jobaps, neogov, oracle, paycom, paylocity,
    remote_json, rss, workday, local_employers,
)
from jobs.sources import JOB_SOURCES  # noqa: E402
from shared.source_yield import record_yields, format_alarms  # noqa: E402

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
    "custom_html": local_employers.parse,
    "neogov": neogov.parse,
    "jobaps": jobaps.parse,
    "edjoin": edjoin.parse,
    "rss": rss.parse,
    "remote_json": remote_json.parse,
    "workday": workday.parse,
    "oracle": oracle.parse,
    "dayforce": dayforce.parse,
    "paycom": paycom.parse,
    "paylocity": paylocity.parse,
    "calopps": calopps.parse,
}

# Platforms fetched as a plain firecrawl markdown scrape (no special POST
# body or JSON REST call). Paycom additionally needs render wait time
# (handled in fetch_raw, not here). Platforms with no PARSERS entry
# (iCIMS/ADP/custom_html/phenom/peoplesoft/taleo) are registry-ready but
# not yet onboarded -- build_jobs finds no parser and skips them cleanly.
_MARKDOWN_PLATFORMS = {"neogov", "jobaps", "edjoin", "calopps", "custom_html",
                        "icims", "dayforce", "paylocity", "adp",
                        "phenom", "peoplesoft", "taleo"}

MIN_SAFE_TOTAL = 5

_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_ROOT_DIR, "data")
_REVIEW_DIR = os.path.join(_ROOT_DIR, "review")
_PARTIALS_DIR = os.path.join(_ROOT_DIR, "partials")
JOBS_PATH = os.path.join(_DATA_DIR, "jobs.json")
QUEUE_PATH = os.path.join(_REVIEW_DIR, "jobs-pending.json")
YIELD_PATH = os.path.join(_REVIEW_DIR, "jobs-source-yield.json")
REVIEW_BOARD_PATH = os.path.join(_REVIEW_DIR, "review-board.html")
MANUAL_JOBS_PATH = os.path.join(_PARTIALS_DIR, "manual-jobs.json")
MANUAL_TTL_DAYS = 30


def fetch_raw(source, http_get_fn, http_json_fn, firecrawl_markdown_fn, http_post_json_fn=None):
    """Dispatch a source's fetch by platform. Fetchers are injected for tests."""
    platform = source.get("platform", "")
    config = source.get("config") or {}
    if config.get("local_index"):
        return http_get_fn(source["url"])
    if platform == "remote_json":
        return http_json_fn(source["url"])
    if platform == "http_json":
        # Same transport as remote_json, deliberately a separate name:
        # "remote_json" also carries the meaning "a remote-WORK board" in the
        # registry and its tests, and EDJOIN is the opposite of that.
        return http_json_fn(source["url"])
    if platform == "rss":
        return http_get_fn(source["url"])
    if platform == "workday":
        post_fn = http_post_json_fn or http_post_json
        host = config.get("host", "").rstrip("/")
        tenant = config.get("tenant", "")
        site = config.get("site", "")
        endpoint = "%s/wday/cxs/%s/%s/jobs" % (host, tenant, site)
        body = {"appliedFacets": {}, "limit": config.get("limit", 20), "offset": 0, "searchText": ""}
        return post_fn(endpoint, body)
    if platform == "oracle":
        rest_url = config.get("rest_url") or source["url"]
        return http_json_fn(rest_url)
    if platform == "paycom":
        return firecrawl_markdown_fn(source["url"], wait_ms=5000)
    if platform in _MARKDOWN_PLATFORMS:
        return firecrawl_markdown_fn(source["url"])
    # Unknown platform: let the caller's per-source try/except catch this and
    # skip cleanly.
    raise RuntimeError("no fetch strategy for platform %r" % platform)


_MANUAL_SOURCE = {"name": "Community submission"}


def job_identity_url(url):
    """Retain requisition query IDs; remove only recognized tracking fields."""
    parts = urlsplit(str(url or "").strip())
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if not key.lower().startswith("utm_")
             and key.lower() not in {"fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"}]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"),
                       urlencode(sorted(query)), parts.fragment))


def preserve_first_seen(jobs, previous_jobs, today):
    """Carry forward valid observed dates without guessing missing history."""
    previous = {}
    for job in previous_jobs or []:
        key = job_identity_url(job.get("canonical_url", ""))
        value = job.get("first_seen_at", "")
        try:
            valid = date.fromisoformat(value).isoformat() == value and value <= today
        except (ValueError, TypeError):
            valid = False
        if key and valid:
            previous[key] = min(previous.get(key, value), value)
    for job in jobs:
        prior = previous.get(job_identity_url(job.get("canonical_url", "")))
        if prior:
            job["first_seen_at"] = prior


def build_jobs(sources, fetchers, today, manual_path=MANUAL_JOBS_PATH, previous_jobs=None, diagnostics=None):
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
    http_post_json_fn = fetchers.get("http_post_json", http_post_json)

    published = []
    queued = []
    # Rows produced per ENABLED source, so a source that quietly stops
    # returning anything can be alarmed on. See shared/source_yield.py.
    counts = {}
    outcomes = diagnostics if diagnostics is not None else {}
    for source in sources:
        if not source.get("enabled"):
            continue
        outcome = outcomes[source["name"]] = {
            "status": "pending", "parsed": 0, "eligible": 0,
            "rejected": {}, "row_errors": 0, "publication_candidates": 0, "deduplicated": 0,
        }
        parser_fn = PARSERS.get(source.get("parser"))
        if parser_fn is None:
            outcome["status"] = "parser-unavailable"
            continue  # not yet onboarded (registry-ready, parser pending)
        # A per-parse context copy carries `_today` (Workday's relative-date
        # parsing needs it) without mutating the shared registry entry.
        source_ctx = dict(source)
        source_ctx["_today"] = today
        try:
            raw_data = fetch_raw(source, http_get_fn, http_json_fn, firecrawl_fn, http_post_json_fn)
            raw_rows = parser_fn(raw_data, source_ctx)
        except Exception as exc:  # noqa: BLE001 -- a broken source must never abort the run
            outcome["status"] = "fetch-or-parse-failed"
            print("refresh_jobs: source %r failed: %s" % (source.get("name"), exc), file=sys.stderr)
            counts[source.get("name")] = 0
            continue
        counts[source.get("name")] = len(raw_rows)
        outcome["parsed"] = len(raw_rows)
        outcome["status"] = "parsed" if raw_rows else "empty-response"

        for raw in raw_rows:
            try:
                job = normalize_job(raw, source, today)
                ok, reason = include_job(job)
                if raw.get("review_required"):
                    ok, reason = False, "employer-detail-review-required"
                    job["verification_status"] = "pending-review"
                if ok:
                    outcome["eligible"] += 1
                    published.append(job)
                else:
                    outcome["rejected"][reason] = outcome["rejected"].get(reason, 0) + 1
                    job = dict(job)
                    job["_queue_reason"] = reason
                    queued.append(job)
            except Exception as exc:  # noqa: BLE001 -- one bad row must not drop the source
                outcome["row_errors"] += 1
                print(
                    "refresh_jobs: row from source %r failed: %s" % (source.get("name"), exc),
                    file=sys.stderr,
                )
                continue

    for raw in load_manual_entries(manual_path, today, MANUAL_TTL_DAYS):
        try:
            manual_source = {"name": raw.get("source_name") or _MANUAL_SOURCE["name"]}
            job = normalize_job(raw, manual_source, today)
            # A daily rebuild is not a fresh human review of this posting.
            job["last_verified_at"] = (raw.get("renewed_at") or raw["submitted_at"])[:10]
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

    # Different requisitions may legitimately share title, employer and city.
    published = dedupe_by(published, lambda j: job_identity_url(j["canonical_url"]) or j["id"])
    for job in published:
        if job.get("source") in outcomes:
            outcomes[job["source"]]["publication_candidates"] += 1
    for outcome in outcomes.values():
        outcome["deduplicated"] = outcome["eligible"] - outcome["publication_candidates"]
    preserve_first_seen(published, previous_jobs, today)
    return published, queued, counts


def _pacific_today():
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:  # noqa: BLE001 -- tzdata may be unavailable on some hosts
        return date.today().isoformat()


def main():
    today = _pacific_today()
    diagnostics = {}
    published, queued, counts = build_jobs(
        JOB_SOURCES,
        {"http_get": http_get, "http_json": http_json, "firecrawl_markdown": firecrawl_markdown},
        today,
        previous_jobs=(load_json(JOBS_PATH, default={}) or {}).get("jobs", []),
        diagnostics=diagnostics,
    )
    # Save diagnostic evidence even when the total-count publication guard fails.
    # Empty parse is not certified as zero vacancies: a changed page can also be empty.
    write_json_atomic(os.path.join(_REVIEW_DIR, "jobs-source-outcomes.json"), {
        "updated": today, "public_feed_write": "not-completed", "sources": diagnostics,
    })
    write_public_json_guarded(
        JOBS_PATH, key="jobs", records=published, min_total=MIN_SAFE_TOTAL,
        note="Boulder Creek Local jobs board. Auto-refreshed; see refresh_jobs.py.",
        today=today,
    )
    write_json_atomic(os.path.join(_REVIEW_DIR, "jobs-source-outcomes.json"), {
        "updated": today, "public_feed_write": "local-file-written",
        "local_feed_count": len(published), "sources": diagnostics,
    })
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
    alarms = record_yields(YIELD_PATH, counts, today)
    print("refresh_jobs: published=%d queued=%d" % (len(published), len(queued)))
    if alarms:
        # stderr so it stands out in refresh.log next to real failures
        print(format_alarms(alarms, "jobs"), file=sys.stderr)


if __name__ == "__main__":
    main()
