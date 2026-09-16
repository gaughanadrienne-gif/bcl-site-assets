"""Tests for scripts/check_event_status.py.

The rule these guard: a block must never read as a cancellation, and an absent
eventStatus must never read as one either. Most organizers publish no status at
all, so defaulting to CANCELLED would empty the calendar.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.check_event_status import (
    build_review_report,
    check,
    classify,
    extract_event_status,
    upcoming,
    write_review_report,
)


CANCELLED_PAGE = '{"@type":"Event","eventStatus":"https:\\/\\/schema.org\\/EventCancelled"}'
SCHEDULED_PAGE = '{"@type":"Event","eventStatus":"https://schema.org/EventScheduled"}'
PLAIN_PAGE = "<html><body><h1>Community Crafters</h1></body></html>"


def test_extracts_escaped_and_plain_status():
    assert extract_event_status(CANCELLED_PAGE) == "EventCancelled"
    assert extract_event_status(SCHEDULED_PAGE) == "EventScheduled"
    assert extract_event_status(PLAIN_PAGE) == ""


def test_cancelled_is_detected():
    assert classify(200, CANCELLED_PAGE)[0] == "CANCELLED"
    assert classify(200, '{"eventStatus":"https://schema.org/EventPostponed"}')[0] == "CANCELLED"


def test_scheduled_and_silent_pages_are_ok():
    assert classify(200, SCHEDULED_PAGE)[0] == "OK"
    # The common case: the organizer publishes no status. That is not a cancellation.
    assert classify(200, PLAIN_PAGE)[0] == "OK"


def test_blocks_are_never_cancellations():
    for code in (403, 429, 400, 500):
        assert classify(code, None, "HTTP %s" % code)[0] == "BLOCKED"
    # A timeout or DNS failure arrives with no status code at all.
    assert classify(None, None, "URLError")[0] == "BLOCKED"


def test_missing_listing_is_dead_not_cancelled():
    assert classify(404, None)[0] == "DEAD"
    assert classify(410, None)[0] == "DEAD"


def test_upcoming_filters_past_events_and_events_without_a_url():
    events = [
        {"title": "past", "start": "2026-09-01T10:00", "url": "https://example.com/a"},
        {"title": "today", "start": "2026-09-16T10:00", "url": "https://example.com/b"},
        {"title": "future", "start": "2026-10-01", "url": "https://example.com/c"},
        {"title": "no url", "start": "2026-10-01"},
    ]
    titles = [e["title"] for e in upcoming(events, "2026-09-16", include_all=False)]
    assert titles == ["today", "future"]
    assert len(upcoming(events, "2026-09-16", include_all=True)) == 3


class _StubFetcher:
    """Replays a scripted response per call so retry behaviour is testable."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, timeout=30):
        self.calls.append(url)
        return self.responses.pop(0)


def test_transient_block_clears_on_retry(monkeypatch):
    monkeypatch.setattr("scripts.check_event_status.RETRY_AFTER", 0)
    monkeypatch.setattr("scripts.check_event_status.time.sleep", lambda _s: None)
    fetcher = _StubFetcher([(429, None, "HTTP 429"), (200, SCHEDULED_PAGE, "")])
    result = check([{"title": "t", "start": "2026-10-01", "url": "https://example.com/x"}], fetcher)
    assert result[0]["verdict"] == "OK"
    assert "passed on retry" in result[0]["detail"]


def test_cancellation_survives_and_is_not_retried_away(monkeypatch):
    monkeypatch.setattr("scripts.check_event_status.RETRY_AFTER", 0)
    monkeypatch.setattr("scripts.check_event_status.time.sleep", lambda _s: None)
    fetcher = _StubFetcher([(200, CANCELLED_PAGE, "")])
    result = check([{"title": "t", "start": "2026-10-01", "url": "https://example.com/x"}], fetcher)
    assert result[0]["verdict"] == "CANCELLED"
    assert fetcher.calls == ["https://example.com/x"]


def test_recurring_events_share_one_organizer_fetch():
    fetcher = _StubFetcher([(200, PLAIN_PAGE, "")])
    events = [
        {"title": "weekly one", "start": "2026-10-01", "url": "https://example.com/calendar"},
        {"title": "weekly two", "start": "2026-10-08", "url": "https://example.com/calendar"},
    ]
    result = check(events, fetcher)
    assert [row["verdict"] for row in result] == ["OK", "OK"]
    assert fetcher.calls == ["https://example.com/calendar"]


def test_dead_link_confirmed_twice_stays_dead(monkeypatch):
    monkeypatch.setattr("scripts.check_event_status.RETRY_AFTER", 0)
    monkeypatch.setattr("scripts.check_event_status.time.sleep", lambda _s: None)
    fetcher = _StubFetcher([(404, None, "HTTP 404"), (404, None, "HTTP 404")])
    result = check([{"title": "t", "start": "2026-10-01", "url": "https://example.com/x"}], fetcher)
    assert result[0]["verdict"] == "DEAD"


def test_block_then_cancelled_stays_blocked_for_human_review(monkeypatch):
    monkeypatch.setattr("scripts.check_event_status.RETRY_AFTER", 0)
    monkeypatch.setattr("scripts.check_event_status.time.sleep", lambda _s: None)
    fetcher = _StubFetcher([(429, None, "HTTP 429"), (200, CANCELLED_PAGE, "")])
    result = check([{"title": "t", "start": "2026-10-01", "url": "https://example.com/x"}], fetcher)
    assert result[0]["verdict"] == "BLOCKED"
    assert result[0]["second_attempt"]["verdict"] == "CANCELLED"


def test_review_report_preserves_decision_and_drops_run_timestamp():
    results = [{
        "title": "Community Crafters", "start": "2026-10-17T10:00",
        "url": "https://example.com/event/1", "verdict": "DEAD",
        "detail": "organizer returned 404", "checked_utc": "2026-09-16T20:00:00+00:00",
        "second_attempt": {"http": 404, "verdict": "DEAD", "detail": "organizer returned 404"},
    }]
    first = build_review_report(results)
    first["findings"][0].update(decision="accept", review_note="Organizer confirmed", reviewed_at="2026-09-16")
    results[0]["checked_utc"] = "2026-09-23T20:00:00+00:00"
    second = build_review_report(results, first)

    assert second == first
    assert "checked_utc" not in str(second)


def test_review_report_write_is_idempotent(tmp_path):
    path = tmp_path / "events-review.json"
    results = [{
        "title": "Facebook event", "start": "2026-10-01", "url": "https://facebook.com/x",
        "verdict": "BLOCKED", "detail": "HTTP 400", "second_attempt": None,
    }]
    assert write_review_report(path, results) is True
    before = path.read_bytes()
    assert write_review_report(path, results) is False
    assert path.read_bytes() == before
    payload = __import__("json").loads(before)
    assert payload["findings"][0]["verdict"] == "BLOCKED"
    assert "do not treat this as cancellation" in payload["findings"][0]["recommended_action"]
