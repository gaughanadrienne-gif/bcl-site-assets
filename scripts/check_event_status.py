"""Check upcoming events against their organizer pages for cancellation.

``data/events.json`` is hand-curated, so nothing else in the repo notices when an
organizer cancels, postpones or deletes an event that BCL is still advertising.
A resident who drives to a cancelled session loses an afternoon and some trust in
the calendar, so this reads what the organizer publishes rather than guessing.

It reports; it never edits the feed. Cancellations are a curation decision.

Signals, strongest first:

``eventStatus``
    Organizers running Library Market (``santacruzpl.libnet.info``) publish
    schema.org ``EventCancelled`` / ``EventPostponed`` / ``EventRescheduled`` /
    ``EventMovedOnline`` in the page JSON-LD. This is unambiguous.

``404`` / ``410``, reproduced
    The organizer deleted the listing. That usually means the occurrence is gone,
    but it is not proof of cancellation, so it is reported as a dead link.

A ``403``, ``429``, connection error or timeout is a block, never a cancellation.
Facebook returns ``400`` to every non-browser client, so events pointing at
facebook.com are expected to land in BLOCKED and mean nothing.

Usage::

    python scripts/check_event_status.py                # upcoming events only
    python scripts/check_event_status.py --json out.json
    python scripts/check_event_status.py --all          # ignore the date filter

Exit status is 1 when any event is CANCELLED or DEAD, so a scheduled run can be
wired to raise it. Blocks alone never fail the run.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVENTS = ROOT / "data" / "events.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
PER_HOST_DELAY = 1.0
RETRY_AFTER = 60

STATUS_RE = re.compile(r'"eventStatus"\s*:\s*"([^"]+)"')
LIVE_STATUSES = {"", "EventScheduled"}


def extract_event_status(html: str) -> str:
    """Return the bare schema.org eventStatus token, or '' when absent."""
    match = STATUS_RE.search(html)
    if not match:
        return ""
    return match.group(1).replace("\\/", "/").rstrip("/").rsplit("/", 1)[-1]


def classify(http_status: int | None, html: str | None, error: str = "") -> tuple[str, str]:
    """Return (verdict, detail) for one organizer response."""
    if http_status in (404, 410):
        return "DEAD", "organizer returned %s" % http_status
    if http_status is None or http_status >= 400:
        return "BLOCKED", error or ("organizer returned %s" % http_status)
    token = extract_event_status(html or "")
    if token and token not in LIVE_STATUSES:
        return "CANCELLED", token
    return "OK", token or "no eventStatus published"


class Fetcher:
    """Polite single-threaded fetcher: at most one request per second per host."""

    def __init__(self, delay: float = PER_HOST_DELAY) -> None:
        self.delay = delay
        self._last: dict[str, float] = {}

    def get(self, url: str, timeout: int = 30) -> tuple[int | None, str | None, str]:
        host = urlparse(url).netloc
        wait = self.delay - (time.time() - self._last.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read().decode("utf-8", "replace"), ""
        except urllib.error.HTTPError as exc:
            return exc.code, None, "HTTP %s" % exc.code
        except Exception as exc:  # noqa: BLE001 - any transport failure is a block
            return None, None, repr(exc)[:200]
        finally:
            self._last[host] = time.time()


def upcoming(events: list[dict], today: str, include_all: bool) -> list[dict]:
    out = []
    for event in events:
        if not event.get("url"):
            continue
        if include_all or str(event.get("start") or "")[:10] >= today:
            out.append(event)
    return out


def check(events: list[dict], fetcher: Fetcher | None = None) -> list[dict]:
    """Check each event once, then re-check the blocked ones after a pause."""
    fetcher = fetcher or Fetcher()
    results = []
    for event in events:
        status, html, error = fetcher.get(event["url"])
        verdict, detail = classify(status, html, error)
        results.append({
            "title": event.get("title"),
            "start": event.get("start"),
            "url": event["url"],
            "http": status,
            "verdict": verdict,
            "detail": detail,
            "checked_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })

    retry = [r for r in results if r["verdict"] in ("BLOCKED", "DEAD")]
    if retry:
        time.sleep(RETRY_AFTER)
        for record in retry:
            status, html, error = fetcher.get(record["url"])
            verdict, detail = classify(status, html, error)
            record["second_attempt"] = {"http": status, "verdict": verdict, "detail": detail}
            if verdict == "OK":
                # A transient block, not a real problem.
                record.update(verdict="OK", http=status, detail=detail + " (passed on retry)")
            elif record["verdict"] == "DEAD" and verdict != "DEAD":
                record["verdict"] = "BLOCKED"
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=Path, default=DEFAULT_EVENTS)
    parser.add_argument("--json", type=Path, help="write the full result set here")
    parser.add_argument("--all", action="store_true", help="check past events too")
    parser.add_argument("--today", default=date.today().isoformat())
    args = parser.parse_args(argv)

    payload = json.loads(args.events.read_text(encoding="utf-8"))
    events = payload["events"] if isinstance(payload, dict) else payload
    targets = upcoming(events, args.today, args.all)
    print("%d events in feed, %d checked" % (len(events), len(targets)))

    results = check(targets)
    if args.json:
        args.json.write_text(json.dumps(results, indent=1), encoding="utf-8")

    counts = Counter(r["verdict"] for r in results)
    for verdict in ("CANCELLED", "DEAD", "BLOCKED"):
        for record in [r for r in results if r["verdict"] == verdict]:
            print("%-9s %-52s %s  %s" % (verdict, (record["title"] or "")[:50],
                                         record["start"], record["detail"]))
    print("\n" + ", ".join("%s %d" % (k, v) for k, v in sorted(counts.items())))
    if counts["BLOCKED"]:
        print("BLOCKED means the organizer refused the request. It is not a cancellation.")
    return 1 if counts["CANCELLED"] or counts["DEAD"] else 0


if __name__ == "__main__":
    sys.exit(main())
