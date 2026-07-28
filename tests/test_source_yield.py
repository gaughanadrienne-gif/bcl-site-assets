"""The alarm that would have caught EDJOIN in week one instead of week N."""
import json
import os
import tempfile

from shared.source_yield import ALARM_AFTER, format_alarms, record_yields


def _tmp():
    return os.path.join(tempfile.mkdtemp(), "yield.json")


def test_a_source_that_keeps_returning_nothing_raises_an_alarm():
    p = _tmp()
    # EDJOIN's exact failure: no exception, just an empty list, every run.
    for day in range(1, ALARM_AFTER):
        alarms = record_yields(p, {"EDJOIN": 0, "Remotive": 20}, "2026-08-%02d" % day)
        assert alarms == [], "alarmed too early on day %d" % day
    alarms = record_yields(p, {"EDJOIN": 0, "Remotive": 20}, "2026-08-%02d" % ALARM_AFTER)
    assert [a[0] for a in alarms] == ["EDJOIN"]
    assert alarms[0][1] == ALARM_AFTER


def test_a_healthy_source_never_alarms():
    p = _tmp()
    for day in range(1, 10):
        alarms = record_yields(p, {"Remotive": 5}, "2026-08-%02d" % day)
        assert alarms == []


def test_one_good_run_clears_the_streak():
    """A district with a genuinely quiet fortnight must not stay in alarm
    forever once it starts posting again."""
    p = _tmp()
    for day in range(1, 6):
        record_yields(p, {"EDJOIN": 0}, "2026-08-%02d" % day)
    assert record_yields(p, {"EDJOIN": 7}, "2026-08-06") == []
    assert record_yields(p, {"EDJOIN": 0}, "2026-08-07") == []


def test_the_state_remembers_when_a_source_last_produced_anything():
    p = _tmp()
    record_yields(p, {"EDJOIN": 12}, "2026-08-01")
    for day in range(2, 6):
        record_yields(p, {"EDJOIN": 0}, "2026-08-%02d" % day)
    state = json.load(open(p, encoding="utf-8"))["sources"]["EDJOIN"]
    assert state["last_nonzero"] == "2026-08-01"
    assert state["zero_streak"] == 4


def test_a_source_dropped_from_the_registry_ages_out():
    p = _tmp()
    record_yields(p, {"Old source": 0, "Kept": 3}, "2026-08-01")
    record_yields(p, {"Kept": 3}, "2026-08-02")
    assert "Old source" not in json.load(open(p, encoding="utf-8"))["sources"]


def test_the_message_names_the_source_and_says_why_it_is_silent():
    msg = format_alarms([("Santa Cruz County schools (EDJOIN)", 9, "2026-07-01")], "jobs")
    assert "EDJOIN" in msg and "9 dry runs" in msg and "2026-07-01" in msg
    # the point of the wording: explain that silence is not an error
    assert "empty parse is not an error" in msg
    assert format_alarms([], "jobs") == ""


def test_a_never_seen_source_reads_clearly_rather_than_as_a_date():
    msg = format_alarms([("Brand New", ALARM_AFTER, None)], "jobs")
    assert "never since tracking began" in msg
