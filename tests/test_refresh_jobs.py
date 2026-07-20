import json

from jobs.refresh_jobs import build_jobs, PUBLIC_SCHEMA_KEYS
from jobs.sources import JOB_SOURCES
from shared.bcl_ingest import is_ca_eligible

TODAY = "2026-07-19"

REMOTIVE = next(s for s in JOB_SOURCES if s["name"] == "Remotive (remote)")
SECOND_HARVEST = next(s for s in JOB_SOURCES if s["name"] == "Second Harvest (RSS)")
SUBSET = [REMOTIVE, SECOND_HARVEST]

REMOTIVE_JSON = json.load(open("tests/fixtures/remotive_sample.json", encoding="utf-8"))
SH_RSS = open("tests/fixtures/secondharvest_sample.rss", encoding="utf-8").read()


def _ok_fetchers():
    return {
        "http_get": lambda url, **kw: SH_RSS,
        "http_json": lambda url, **kw: REMOTIVE_JSON,
        "firecrawl_markdown": lambda url, **kw: "",
    }


def test_build_jobs_produces_valid_published_rows():
    published, queued = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    assert published
    for job in published:
        for key in PUBLIC_SCHEMA_KEYS:
            assert key in job
        if job["geography_tier"] == "remote":
            assert is_ca_eligible(job["remote_regions"])


def test_build_jobs_is_idempotent():
    published1, _ = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    published2, _ = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    assert len(published1) == len(published2)


def test_per_source_exception_does_not_abort_run():
    fetchers = _ok_fetchers()

    def _boom(url, **kw):
        raise RuntimeError("network down")

    # Break the Remotive fetch only; Second Harvest should still produce jobs.
    fetchers["http_json"] = _boom
    published, queued = build_jobs(SUBSET, fetchers, TODAY)
    assert published
    assert all(job["source"] == "Second Harvest (RSS)" for job in published)
