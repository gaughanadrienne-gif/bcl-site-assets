"""Turn owner-approved review-board picks into manual-partial submissions.

The review board (shared/review_board.py) writes queued items to
review/<tool>-pending.json and lets the owner tap-approve them, copying the
approved ids out with the "Copy approved" button. The owner pastes those ids
(one per line) into review/<tool>-approved.txt. This script reads both files,
stamps the approved items as fresh manual submissions, and appends them to
partials/manual-<tool>.json (deduped by id) -- from there the next scheduled
refresh merges them through the normal gates (see build_jobs/build_rentals).

Usage:
    python scripts/promote_submissions.py jobs
    python scripts/promote_submissions.py rentals
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import load_json, write_json_atomic  # noqa: E402

_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVIEW_DIR = os.path.join(_ROOT_DIR, "review")
PARTIALS_DIR = os.path.join(_ROOT_DIR, "partials")


def _reverse_map_job(item):
    """Reverse-map a NORMALIZED pending job (the shape refresh_jobs.py writes
    to review/jobs-pending.json) back to the RAW manual-entry shape that
    normalize_job()/include_job() expect to re-read (raw.get("employer"),
    raw.get("url"), raw.get("description"), raw.get("date_posted"),
    raw.get("remote"), ...)."""
    return {
        "title": item.get("title", ""),
        "employer": item.get("employer_name", ""),
        "city": item.get("city", ""),
        "url": item.get("canonical_url", ""),
        "salary_text": item.get("salary_text", ""),
        "benefits_text": item.get("benefits_text", ""),
        "hours_text": item.get("hours_text", ""),
        "description": item.get("description_summary", ""),
        "date_posted": item.get("posted_at", ""),
        "work_mode": item.get("work_mode", ""),
        "remote": item.get("geography_tier") == "remote",
    }


def _reverse_map_rental(item):
    """Reverse-map a NORMALIZED pending rental (the shape refresh_rentals.py
    writes to review/rentals-pending.json) back to the RAW manual-entry shape
    that normalize_rental()/include_rental() expect to re-read."""
    return {
        "headline": item.get("headline", ""),
        "address_public": item.get("address_public", ""),
        "city": item.get("city", ""),
        "postal_code": item.get("postal_code", ""),
        "monthly_rent": item.get("monthly_rent"),
        "bedrooms": item.get("bedrooms"),
        "bathrooms": item.get("bathrooms"),
        "square_feet": item.get("square_feet"),
        "available_date": item.get("available_date", ""),
        "property_type": item.get("property_type", ""),
        "url": item.get("canonical_url", ""),
        "description": item.get("description_summary", ""),
    }


_REVERSE_MAP = {"jobs": _reverse_map_job, "rentals": _reverse_map_rental}


def promote(pending, approved_ids, today, tool):
    """Return manual-entry dicts (RAW fields + submitted_at/renewed_at) for
    the ids in `approved_ids` that are actually present in `pending`.

    `pending` holds NORMALIZED items (the shape refresh_*.py writes to
    review/<tool>-pending.json: employer_name, canonical_url,
    description_summary, posted_at, geography_tier, ...). Because
    load_manual_entries() -> normalize_job()/normalize_rental() re-read RAW
    keys, this reverse-maps normalized -> raw per `tool` before stamping.
    Pure; never touches disk."""
    reverse_map = _REVERSE_MAP[tool]
    out = []
    for item in pending:
        if item.get("id") in approved_ids:
            entry = reverse_map(item)
            entry["id"] = item.get("id")
            entry["submitted_at"] = today
            entry["renewed_at"] = None
            out.append(entry)
    return out


def _read_approved_ids(path):
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as fh:
        return {line.strip() for line in fh if line.strip()}


def main(tool, today):
    pending_path = os.path.join(REVIEW_DIR, "%s-pending.json" % tool)
    approved_path = os.path.join(REVIEW_DIR, "%s-approved.txt" % tool)
    manual_path = os.path.join(PARTIALS_DIR, "manual-%s.json" % tool)

    pending_raw = load_json(pending_path, default=[])
    # review/<tool>-pending.json may be either a bare list (as tested) or the
    # {"_note", "updated", "count", "<tool>": [...]} shape refresh_*.py writes.
    if isinstance(pending_raw, dict):
        pending = pending_raw.get(tool, [])
    else:
        pending = pending_raw or []

    approved_ids = _read_approved_ids(approved_path)
    new_entries = promote(pending, approved_ids, today, tool)

    manual_data = load_json(manual_path, default=None) or {"entries": []}
    existing = manual_data.get("entries", [])
    existing_ids = {e.get("id") for e in existing if e.get("id")}

    for entry in new_entries:
        if entry.get("id") in existing_ids:
            continue
        existing.append(entry)
        existing_ids.add(entry.get("id"))

    manual_data["entries"] = existing
    write_json_atomic(manual_path, manual_data)
    return manual_data


if __name__ == "__main__":
    from datetime import date

    if len(sys.argv) < 2 or sys.argv[1] not in ("jobs", "rentals"):
        print("usage: python scripts/promote_submissions.py <jobs|rentals>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], date.today().isoformat())
