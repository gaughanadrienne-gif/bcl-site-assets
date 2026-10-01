"""Publish the homepage spotlight feed without revealing future weeks.

WHY THIS EXISTS (2026-10-01). data/spotlight.json used to hold the whole running
order, so anyone could read which business was coming up and its card blurb
months ahead. The owner decided the upcoming order stays private.

The full schedule now lives OUTSIDE the public repo, next to the social schedule it
mirrors:

    Social Media/Blotato_2026_H2/spotlight-schedule.json

This script copies only the rows whose week has already started (Thursday 00:00
Pacific) into data/spotlight.json and publishes that one file with
publish_data_file.py, then purges the jsDelivr @main copy. The card logic in
bcl-tools.js is unchanged: it already shows the latest row that has started.

Task Scheduler runs it through Automation & Operations/sync/run_publish_spotlight.bat
(BCL-SpotlightPublish) on Thursday just after midnight Pacific and daily as a catch-up. If the
PC is off on a Thursday, the previous business holds the card until the next run,
which is the same thing the card does for any gap in the schedule.

Exit codes: 0 published or already current, 1 failure (so Task Scheduler shows it).
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish_data_file  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
PUBLIC_REL = "data/spotlight.json"
MASTER = REPO.parents[1] / "Social Media" / "Blotato_2026_H2" / "spotlight-schedule.json"
PURGE_URL = "https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/spotlight.json"
FIELDS = ("week", "slug", "business", "blurb")


def pacific_today(now=None):
    return (now or datetime.now(ZoneInfo("America/Los_Angeles"))).date()


def week_start(day):
    """The Thursday that owns this day, matching spotlightWeekStart in bcl-tools.js."""
    return day - timedelta(days=(day.weekday() - 3) % 7)


def load_master(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = data.get("schedule")
    if not isinstance(rows, list) or not rows:
        raise ValueError("master schedule has no rows")
    for row in rows:
        if any(not isinstance(row.get(k), str) or not row.get(k) for k in FIELDS):
            raise ValueError("row is missing a field: " + json.dumps(row)[:200])
        if week_start(date.fromisoformat(row["week"])).isoformat() != row["week"]:
            raise ValueError(row["week"] + " is not a Thursday")
    return rows


def public_payload(rows, today):
    """Only weeks that have already started. Fields are copied, nothing else."""
    current = week_start(today).isoformat()
    started = [{k: r[k] for k in FIELDS} for r in rows if r["week"] <= current]
    return {"asOf": today.isoformat(), "schedule": started}


def render(payload):
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--master", default=str(MASTER))
    ap.add_argument("--repo", default=str(REPO))
    ap.add_argument("--dry-run", action="store_true", help="print the public file, write and publish nothing")
    args = ap.parse_args(argv)

    def log(msg):
        print(time.strftime("%Y-%m-%d %H:%M:%S") + " publish_spotlight: " + msg, flush=True)

    try:
        today = pacific_today()
        payload = public_payload(load_master(args.master), today)
        if not payload["schedule"]:
            raise ValueError("no started weeks; refusing to publish an empty feed")
        if args.dry_run:
            sys.stdout.write(render(payload))
            return 0
        # Compare against what origin serves, not the local file: a run whose push
        # failed must not look current to the next run.
        target = Path(args.repo) / PUBLIC_REL
        publish_data_file.git(args.repo, "fetch", "--quiet", "origin", "main")
        live = subprocess.run(["git", "show", "origin/main:" + PUBLIC_REL], cwd=args.repo,
                              capture_output=True, encoding="utf-8")
        old = json.loads(live.stdout) if live.returncode == 0 else {}
        if old.get("schedule") == payload["schedule"]:
            log("rows unchanged (" + payload["schedule"][-1]["week"] + "); nothing to publish")
            return 0
        target.write_text(render(payload), encoding="utf-8", newline="\n")
        publish_data_file.publish(args.repo, [PUBLIC_REL],
                                  "Spotlight feed: weeks through " + payload["schedule"][-1]["week"], log=log)
        with urllib.request.urlopen(PURGE_URL, timeout=30) as r:
            log("jsDelivr purge HTTP " + str(r.status))
    except Exception as exc:  # scheduled task: one clear line, nonzero exit
        log("FAILED: " + str(exc))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
