"""Guards the RSS registry-config bug: the real JOB_SOURCES entries for
Second Harvest and We Work Remotely must carry a usable config so rss.parse
doesn't degrade to blank employers/wrong style when config is omitted."""

from jobs.parsers import rss
from jobs.sources import JOB_SOURCES

WWR = next(s for s in JOB_SOURCES if s["name"] == "We Work Remotely (remote)")
SH = next(s for s in JOB_SOURCES if s["name"] == "Second Harvest (RSS)")


def test_second_harvest_real_source_has_employer():
    xml = open("tests/fixtures/secondharvest_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, SH)
    assert rows
    for r in rows:
        assert r["employer"]


def test_we_work_remotely_real_source_is_remote():
    xml = open("tests/fixtures/wwr_sample.rss", encoding="utf-8").read()
    rows = rss.parse(xml, WWR)
    assert rows
    for r in rows:
        assert r["remote"] is True
        assert r["title"]
        assert r["employer"]
