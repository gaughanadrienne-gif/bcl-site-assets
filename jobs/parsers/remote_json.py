"""Parser for JSON remote-job APIs (Remotive schema)."""

from shared.bcl_ingest import is_ca_eligible, sanitize_text


def parse(data, source):
    rows = []
    for job in (data or {}).get("jobs", []):
        loc = job.get("candidate_required_location", "") or ""
        if not is_ca_eligible(loc):
            continue
        rows.append({
            "title": sanitize_text(job.get("title")),
            "employer": sanitize_text(job.get("company_name")),
            "location_text": loc, "city": "", "url": job.get("url", ""),
            "date_posted": (job.get("publication_date") or "")[:10],
            "salary_text": sanitize_text(job.get("salary")),
            "benefits_text": "", "hours_text": sanitize_text(job.get("job_type")),
            "description": sanitize_text(job.get("description")),
            "work_mode": "remote", "remote": True, "eligibility_text": loc,
        })
    return rows
