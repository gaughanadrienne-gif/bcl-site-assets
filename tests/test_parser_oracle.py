import json
import os

from jobs.parsers import oracle

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "oracle_safeway.json")


def _load():
    with open(_FIXTURE, encoding="utf-8") as fh:
        return json.load(fh)


def _source(**config):
    base = {"name": "Safeway (Albertsons)", "url": "https://www.albertsonscompanies.com/careers/find-a-job.html"}
    if config:
        base["config"] = config
    return base


def test_parses_all_requisitions():
    rows = oracle.parse(_load(), _source())
    assert len(rows) == 3
    assert all(r["title"] for r in rows)


def test_los_gatos_row_is_core():
    rows = oracle.parse(_load(), _source())
    row = next(r for r in rows if r["location_text"] == "Los Gatos, CA, United States")
    assert row["city"] == "Los Gatos"
    assert row["title"] == "Deli Associate"
    assert row["date_posted"] == "2026-07-13"


def test_job_url_pattern_uses_id():
    rows = oracle.parse(_load(), _source(job_url="https://x/job/{id}"))
    row = rows[0]
    assert row["url"] == "https://x/job/735936"


def test_falls_back_to_source_url_without_pattern():
    rows = oracle.parse(_load(), _source())
    assert rows[0]["url"] == "https://www.albertsonscompanies.com/careers/find-a-job.html"
