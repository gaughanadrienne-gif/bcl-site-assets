"""Backfill `category` on the already-published jobs feed and review queue.

The daily refresh rebuilds data/jobs.json from scratch, so from the next 06:00
run onward every job carries a classifier category on its own. This script
exists so the LIVE board does not have to wait for that, and so the change can
be reviewed as a data diff before it is pushed.

Idempotent: it re-classifies from title/employer every time, so running it
twice is a no-op. Dry-run by default; pass --apply to write.

    python scripts/backfill_job_categories.py            # show the distribution
    python scripts/backfill_job_categories.py --apply    # write both files
"""
import argparse
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.bcl_ingest import load_json, write_json_atomic  # noqa: E402
from shared.job_categories import classify_job  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = (
    (os.path.join(ROOT, "data", "jobs.json"), "jobs"),
    (os.path.join(ROOT, "review", "jobs-pending.json"), "jobs"),
)


def backfill(payload, key):
    """Set `category` on every record in payload[key]; return (changed, counts)."""
    changed = 0
    counts = collections.Counter()
    for rec in payload.get(key, []):
        new = classify_job(
            rec.get("title", ""), rec.get("employer_name", ""),
            rec.get("category", ""), rec.get("description_summary", ""),
        )
        counts[new] += 1
        if rec.get("category") != new:
            rec["category"] = new
            changed += 1
    return changed, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the files (default: dry run)")
    args = ap.parse_args()

    for path, key in TARGETS:
        payload = load_json(path)
        if not payload:
            print("%s: missing, skipped" % os.path.basename(path))
            continue
        changed, counts = backfill(payload, key)
        print("\n%s: %d records, %d changed" % (os.path.basename(path), len(payload.get(key, [])), changed))
        for cat, n in counts.most_common():
            print("   %-22s %4d" % (cat, n))
        if args.apply and changed:
            write_json_atomic(path, payload)
            print("   written")
        elif args.apply:
            print("   already current, not rewritten")

    if not args.apply:
        print("\nDRY RUN. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
