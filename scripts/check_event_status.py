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
import hashlib
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
DEFAULT_REVIEW = ROOT / "review" / "events-status-review.json"

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
    """Check each unique URL once, then re-check blocked/dead URLs after a pause."""
    fetcher = fetcher or Fetcher()
    results = []
    first_responses = {}
    for event in events:
        url = event["url"]
        if url not in first_responses:
            first_responses[url] = fetcher.get(url)
        status, html, error = first_responses[url]
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
        retry_responses = {}
        for record in retry:
            if record["url"] not in retry_responses:
                retry_responses[record["url"]] = fetcher.get(record["url"])
            status, html, error = retry_responses[record["url"]]
            verdict, detail = classify(status, html, error)
            record["second_attempt"] = {"http": status, "verdict": verdict, "detail": detail}
            if verdict == "OK":
                # A transient block, not a real problem.
                record.update(verdict="OK", http=status, detail=detail + " (passed on retry)")
            elif record["verdict"] == "DEAD" and verdict != "DEAD":
                record["verdict"] = "BLOCKED"
    return results


def _finding_key(record: dict) -> str:
    """Stable identity for one event/status finding across weekly runs."""
    identity = [record.get("url"), record.get("start"), record.get("verdict")]
    encoded = json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


def _review_action(verdict: str) -> str:
    if verdict == "CANCELLED":
        return "confirm organizer status, then accept or reject a feed correction"
    if verdict == "DEAD":
        return "confirm the occurrence with the organizer, then accept or reject a feed correction"
    return "retry in a browser or contact the organizer; do not treat this as cancellation"


def build_review_report(results: list[dict], previous: dict | None = None) -> dict:
    """Build a deterministic, human-editable report of non-OK checks.

    The transport timestamp is deliberately excluded. Re-running the same
    checks therefore produces no file churn, and an owner's decision/note is
    preserved while the same finding remains present.
    """
    prior = {
        item.get("key"): item
        for item in (previous or {}).get("findings", [])
        if isinstance(item, dict) and item.get("key")
    }
    findings = []
    for record in results:
        verdict = record.get("verdict")
        if verdict == "OK":
            continue
        key = _finding_key(record)
        old = prior.get(key, {})
        findings.append({
            "key": key,
            "title": record.get("title"),
            "start": record.get("start"),
            "url": record.get("url"),
            "verdict": verdict,
            "detail": record.get("detail"),
            "second_attempt": record.get("second_attempt"),
            "recommended_action": _review_action(verdict),
            "decision": old.get("decision", "pending"),
            "review_note": old.get("review_note", ""),
            "reviewed_at": old.get("reviewed_at", ""),
        })
    findings.sort(key=lambda item: (str(item.get("start") or ""), str(item.get("title") or ""), item["key"]))
    return {
        "_note": (
            "Human review queue only. This checker never edits events.json. "
            "Set decision to accept or reject after checking the organizer. "
            "BLOCKED is an access failure, never evidence of cancellation."
        ),
        "count": len(findings),
        "findings": findings,
    }


def write_review_report(path: Path, results: list[dict]) -> bool:
    """Write only when the deterministic review report changed."""
    try:
        previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    except (OSError, json.JSONDecodeError):
        previous = None
    payload = build_review_report(results, previous)
    rendered = json.dumps(payload, ensure_ascii=False, indent=1) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == rendered:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=Path, default=DEFAULT_EVENTS)
    parser.add_argument("--json", type=Path, help="write the full result set here")
    parser.add_argument(
        "--review", type=Path,
        help="write an idempotent human-review queue (weekly default: %s)" % DEFAULT_REVIEW,
    )
    parser.add_argument("--all", action="store_true", help="check past events too")
    parser.add_argument("--today", default=date.today().isoformat())
    args = parser.parse_args(argv)

    payload = json.loads(args.events.read_text(encoding="utf-8"))
    events = payload["events"] if isinstance(payload, dict) else payload
    targets = upcoming(events, args.today, args.all)
    print("%d events in feed, %d checked" % (len(events), len(targets)))

    results = check(targets)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(results, indent=1), encoding="utf-8")
    if args.review:
        changed = write_review_report(args.review, results)
        print("review report %s: %s" % ("updated" if changed else "unchanged", args.review))

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
