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


def promote(pending, approved_ids, today):
    """Return manual-entry dicts (raw fields + submitted_at/renewed_at) for
    the ids in `approved_ids` that are actually present in `pending`. Pure;
    never touches disk."""
    out = []
    for item in pending:
        if item.get("id") in approved_ids:
            entry = dict(item)
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
    new_entries = promote(pending, approved_ids, today)

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
