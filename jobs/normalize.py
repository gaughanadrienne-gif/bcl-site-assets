"""Map a parser's raw job dict to the public jobs schema (spec section 7),
and decide which normalized jobs are safe to publish directly vs. route to
the review queue.

BCL rule (opposite of a typical job board): there is NO pay floor, and a job
is NEVER dropped for missing pay -- salary_disclosed is simply False and the
job is kept. Only geography ambiguity, excluded categories, or missing
title/url route a job away from the published set.
"""

from shared.bcl_ingest import (
    classify_geo, commute_minutes, make_slug, parse_salary,
    record_fingerprint, sanitize_text, freshness_label,
)

EXCLUDE_KEYWORDS = (
    "mlm", "multi-level marketing", "pay to start", "pay-to-start",
    "mystery shop", "mystery shopping", "reshipping", "re-shipping",
    "work from your phone", "commission only", "commission-only",
)


def normalize_job(raw, source, today):
    remote = bool(raw.get("remote"))
    city = sanitize_text(raw.get("city", ""))
    tier = "remote" if remote else classify_geo(city)
    minutes = None if remote else commute_minutes(city)
    title = sanitize_text(raw.get("title", ""))
    employer = sanitize_text(raw.get("employer", ""))
    url = raw.get("url", "") or ""
    salary = parse_salary(raw.get("salary_text", ""))
    posted = raw.get("date_posted", "") or ""

    return {
        "id": record_fingerprint([title, employer, city, url]),
        "slug": make_slug(employer, title),
        "title": title,
        "title_original": raw.get("title", "") or "",
        "employer_name": employer,
        "description_summary": sanitize_text(raw.get("description", ""))[:400],
        "employment_type": sanitize_text(raw.get("hours_text", "")),
        "work_mode": raw.get("work_mode") or ("remote" if remote else "on-site"),
        "remote_regions": sanitize_text(raw.get("eligibility_text", "")) if remote else "",
        "city": city,
        "state": "CA",
        "postal_code": raw.get("postal_code", "") or "",
        "location_precision": "remote" if remote else ("city" if city else "unknown"),
        "geography_tier": tier,
        "commute_minutes": minutes,
        "commute_type": "drive" if minutes is not None else None,
        "salary_min": salary["min"],
        "salary_max": salary["max"],
        "salary_period": salary["period"],
        "salary_text": sanitize_text(raw.get("salary_text", "")),
        "salary_disclosed": salary["disclosed"],
        "benefits_text": sanitize_text(raw.get("benefits_text", "")),
        "hours_text": sanitize_text(raw.get("hours_text", "")),
        "schedule": sanitize_text(raw.get("hours_text", "")),
        "category": source.get("platform", ""),
        "posted_at": posted,
        "application_deadline": sanitize_text(raw.get("application_deadline", "")),
        "canonical_url": url,
        "source": source.get("name", ""),
        "first_seen_at": today,
        "last_verified_at": today,
        "verification_status": "verified",
        "freshness_label": freshness_label(posted, today),
    }


def include_job(job):
    """Return (bool, reason). False routes the job to the review queue."""
    if not job.get("title") or not job.get("canonical_url"):
        return False, "missing-fields"
    haystack = (job.get("title", "") + " " + job.get("description_summary", "")).lower()
    for kw in EXCLUDE_KEYWORDS:
        if kw in haystack:
            return False, "excluded-keyword"
    if job.get("geography_tier") == "unknown":
        return False, "ambiguous-location"
    return True, None
