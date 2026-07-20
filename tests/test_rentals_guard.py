"""Tiny-inventory guard tests for write_rentals_guarded.

95006 rental inventory is ~1-5 listings, so there is no count floor: a clean
run may publish 0. The guard only refuses when a run both shrinks the
published set AND had a source fetch error.
"""

import json

import pytest

from shared.bcl_ingest import GuardError, write_rentals_guarded

TODAY = "2026-07-19"


def _seed(path, count):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"_note": "prior", "updated": "2026-07-01", "count": count, "rentals": [{"id": i} for i in range(count)]}, fh)


def test_shrink_with_errors_raises_and_leaves_file_untouched(tmp_path):
    p = str(tmp_path / "rentals.json")
    _seed(p, 3)
    with pytest.raises(GuardError):
        write_rentals_guarded(p, [{"id": 1}], "n", TODAY, had_errors=True)
    on_disk = json.loads(open(p, encoding="utf-8").read())
    assert on_disk["count"] == 3


def test_clean_run_may_publish_zero(tmp_path):
    p = str(tmp_path / "rentals.json")
    _seed(p, 3)
    payload = write_rentals_guarded(p, [], "n", TODAY, had_errors=False)
    assert payload["count"] == 0
    on_disk = json.loads(open(p, encoding="utf-8").read())
    assert on_disk["count"] == 0


def test_growth_with_errors_still_writes(tmp_path):
    p = str(tmp_path / "rentals.json")
    _seed(p, 3)
    payload = write_rentals_guarded(
        p, [{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}], "n", TODAY, had_errors=True
    )
    assert payload["count"] == 4
    on_disk = json.loads(open(p, encoding="utf-8").read())
    assert on_disk["count"] == 4


def test_no_prior_file_writes_cleanly(tmp_path):
    p = str(tmp_path / "rentals.json")
    payload = write_rentals_guarded(p, [{"id": 1}], "n", TODAY, had_errors=True)
    assert payload["count"] == 1
