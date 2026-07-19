import json
from shared.bcl_ingest import is_ca_eligible
from jobs.parsers import remote_json
from jobs.sources import JOB_SOURCES

REMOTIVE = next(s for s in JOB_SOURCES if s["name"] == "Remotive (remote)")


def test_ca_eligible():
    assert is_ca_eligible("USA") is True
    assert is_ca_eligible("Anywhere") is True
    assert is_ca_eligible("California") is True
    assert is_ca_eligible("Europe only") is False
    assert is_ca_eligible("") is False


def test_remotive_parse_returns_records():
    data = json.load(open("tests/fixtures/remotive_sample.json", encoding="utf-8"))
    rows = remote_json.parse(data, REMOTIVE)
    assert isinstance(rows, list)
    for r in rows:
        assert r["remote"] is True and r["work_mode"] == "remote"
        assert r["title"] and r["url"] and r["employer"]
        assert is_ca_eligible(r["eligibility_text"])  # only eligible kept
