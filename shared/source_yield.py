"""Zero-yield alarm for the jobs and rentals feeds.

WHY THIS EXISTS
On 2026-07-28 we found six enabled EDJOIN school-district sources that had been
contributing **zero rows for an unknown number of weeks**, hiding 84 local
openings, without ever appearing in the error log. The cause was mundane: EDJOIN
went client-side, the parser matched nothing, and returned an empty list.

**An empty parse is not an exception.** `build_jobs` catches and logs per-source
errors, but a source that simply returns [] looks exactly like a genuinely quiet
week, so the run reports success forever. That is the failure mode this module
closes: it remembers how many rows each source produced, and shouts when an
enabled source has produced nothing for several runs in a row.

It deliberately does NOT fail the run. A quiet source is not a reason to stop
publishing the other 300 jobs; it is a reason to tell somebody.
"""
from __future__ import annotations

import json
import os

# A source can legitimately be empty for a day or two (a small district with no
# openings, a rental manager between listings). Three consecutive dry runs is
# the point where "quiet" stops being the likeliest explanation.
ALARM_AFTER = 3


def _load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001 -- first run, or a corrupt file we can rebuild
        return {}


def record_yields(state_path, counts, today):
    """Update the rolling per-source history and return the sources currently
    in alarm.

    `counts` maps source name -> rows produced this run, for ENABLED sources
    only. A source that disappears from the registry ages out of the state on
    its own, because we rewrite the file from `counts` each run.

    Returns a list of (name, zero_streak, last_seen) sorted worst-first.
    """
    prev = _load(state_path).get("sources", {})
    state = {}
    alarms = []

    for name, n in sorted(counts.items()):
        old = prev.get(name, {})
        streak = (old.get("zero_streak", 0) + 1) if n == 0 else 0
        entry = {
            "last_count": n,
            "zero_streak": streak,
            # keep the last date this source actually produced something, which
            # is the single most useful number when diagnosing later
            "last_nonzero": today if n else old.get("last_nonzero"),
        }
        state[name] = entry
        if streak >= ALARM_AFTER:
            alarms.append((name, streak, entry["last_nonzero"]))

    alarms.sort(key=lambda a: (-a[1], a[0]))

    tmp = state_path + ".tmp"
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"updated": today, "alarm_after": ALARM_AFTER, "sources": state},
                  f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, state_path)
    return alarms


def format_alarms(alarms, tool):
    """One line per dry source, written to be understood weeks later."""
    if not alarms:
        return ""
    lines = ["", "%s: %d ENABLED SOURCE(S) HAVE PRODUCED NOTHING FOR %d+ RUNS."
             % (tool.upper(), len(alarms), ALARM_AFTER),
             "An empty parse is not an error, so these fail silently. Check "
             "whether the site went client-side or changed shape."]
    for name, streak, last in alarms:
        lines.append("  - %s: %d dry runs, last produced rows %s"
                     % (name, streak, last or "never since tracking began"))
    return "\n".join(lines)
