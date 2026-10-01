import json
from datetime import date

import pytest

from scripts.publish_spotlight import load_master, public_payload, week_start

ROWS = [
    {"week": "2026-09-24", "slug": "a-boulder-creek", "business": "A", "blurb": "Past."},
    {"week": "2026-10-01", "slug": "b-boulder-creek", "business": "B", "blurb": "Current."},
    {"week": "2026-10-08", "slug": "c-boulder-creek", "business": "C", "blurb": "Future."},
]


def test_week_starts_on_thursday():
    assert week_start(date(2026, 10, 1)) == date(2026, 10, 1)   # Thursday
    assert week_start(date(2026, 10, 7)) == date(2026, 10, 1)   # Wednesday
    assert week_start(date(2026, 10, 8)) == date(2026, 10, 8)


def test_public_feed_drops_future_weeks():
    out = public_payload(ROWS, date(2026, 10, 7))
    assert [r["week"] for r in out["schedule"]] == ["2026-09-24", "2026-10-01"]
    assert out["asOf"] == "2026-10-07"


def test_next_row_appears_on_its_thursday():
    out = public_payload(ROWS, date(2026, 10, 8))
    assert out["schedule"][-1]["slug"] == "c-boulder-creek"


def test_public_feed_copies_only_card_fields():
    rows = [dict(ROWS[0], note="private planning note")]
    assert "note" not in public_payload(rows, date(2026, 10, 1))["schedule"][0]


def test_master_rejects_non_thursday(tmp_path):
    bad = tmp_path / "m.json"
    bad.write_text(json.dumps({"schedule": [dict(ROWS[0], week="2026-09-25")]}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_master(bad)
