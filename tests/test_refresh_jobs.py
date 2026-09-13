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
    published, queued, _counts = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    assert published
    for job in published:
        for key in PUBLIC_SCHEMA_KEYS:
            assert key in job
        if job["geography_tier"] == "remote":
            assert is_ca_eligible(job["remote_regions"])


def test_build_jobs_is_idempotent():
    published1, _, _ = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    published2, _, _ = build_jobs(SUBSET, _ok_fetchers(), TODAY)
    assert len(published1) == len(published2)


def test_per_source_exception_does_not_abort_run():
    fetchers = _ok_fetchers()

    def _boom(url, **kw):
        raise RuntimeError("network down")

    # Break the Remotive fetch only; Second Harvest should still produce jobs.
    fetchers["http_json"] = _boom
    published, queued, _counts = build_jobs([dict(REMOTIVE, enabled=True), SECOND_HARVEST], fetchers, TODAY)
    assert published
    assert all(job["source"] == "Second Harvest (RSS)" for job in published)


def test_disabled_remote_sources_never_fetch():
    def forbidden(*args, **kwargs):
        raise AssertionError("generic remote source must not fetch")
    published, queued, counts = build_jobs(
        [s for s in JOB_SOURCES if s.get("geo") == "remote"],
        {"http_get": forbidden, "http_json": forbidden}, TODAY,
        manual_path="__no_such_file__.json")
    assert published == queued == []
    assert counts == {}


def test_forced_generic_remote_feed_is_rejected_by_policy_gate():
    published, queued, _ = build_jobs([dict(REMOTIVE, enabled=True)], _ok_fetchers(), TODAY,
                                      manual_path="__no_such_file__.json")
    assert published == []
    assert queued
    assert all(j["_queue_reason"] == "remote-local-evidence-required" for j in queued)


def test_jobaps_distinct_query_requisitions_survive():
    from pathlib import Path
    from jobs.parsers import jobaps
    src = next(s for s in JOB_SOURCES if s["name"] == "County of Santa Cruz")
    fixture = Path("tests/fixtures/jobaps_scruz.md").read_text(encoding="utf-8")
    raw_rows = jobaps.parse(fixture, src)
    published, _, _ = build_jobs([src], {"firecrawl_markdown": lambda *a, **k: fixture}, TODAY,
                                  manual_path="__no_such_file__.json")
    assert len(raw_rows) == 29
    assert len(published) == 29


def test_job_identity_preserves_ids_but_deduplicates_tracking():
    from jobs.refresh_jobs import job_identity_url
    assert job_identity_url("https://example.org/jobs?R1=26&R2=A&utm_source=x") == job_identity_url(
        "https://example.org/jobs?R2=A&R1=26&fbclid=y")
    assert job_identity_url("https://example.org/jobs?id=1") != job_identity_url("https://example.org/jobs?id=2")
    assert job_identity_url("https://example.org/jobs?ref=1") != job_identity_url("https://example.org/jobs?ref=2")


def test_first_seen_survives_next_refresh_without_invented_history():
    from jobs.refresh_jobs import preserve_first_seen
    rows = [{"canonical_url": "https://example.org/jobs?id=1&utm_source=new", "first_seen_at": "2026-09-13"},
            {"canonical_url": "https://example.org/jobs?id=2", "first_seen_at": "2026-09-13"}]
    previous = [{"canonical_url": "https://example.org/jobs?id=1", "first_seen_at": "2026-07-19"}]
    preserve_first_seen(rows, previous, "2026-09-13")
    assert [j["first_seen_at"] for j in rows] == ["2026-07-19", "2026-09-13"]
    preserve_first_seen(rows, [{"canonical_url": rows[1]["canonical_url"], "first_seen_at": "tomorrow"}], "2026-09-13")
    assert rows[1]["first_seen_at"] == "2026-09-13"


def test_build_carries_previous_first_seen_into_published_rows():
    first, _, _ = build_jobs([SECOND_HARVEST], _ok_fetchers(), TODAY, manual_path="__no_such_file__.json")
    later, _, _ = build_jobs([SECOND_HARVEST], _ok_fetchers(), "2026-09-13",
                             manual_path="__no_such_file__.json", previous_jobs=first)
    assert later and all(j["first_seen_at"] == TODAY for j in later)
