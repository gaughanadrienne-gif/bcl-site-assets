import pytest

from jobs.parsers.local_employers import parse
from jobs.refresh_jobs import build_jobs
from jobs.sources import JOB_SOURCES


def source(name):
    return next(s for s in JOB_SOURCES if s["name"] == name)


URL = "https://www.paycomonline.net/v4/ats/web.php/portal/58F6BA3B1C1AA25D186569BA421811AE/jobs/460155"
HTML = '<h2>CURRENT OPENINGS</h2><a href="%s">Linen Driver</a><h2>Other Ways to Join Us</h2>' % URL


def test_mount_hermon_index_never_invents_worksite_or_pay():
    rows = parse(HTML, source("Mount Hermon"))
    assert len(rows) == 1
    assert rows[0]["city"] == ""
    assert rows[0]["review_required"] is True
    assert "salary_text" not in rows[0]


def test_only_current_known_tenant_links_are_discovered():
    html = '<a href="%s">Old job</a>' % URL + HTML.replace('</h2><a', '</h2><a', 1)
    html += '<a href="%s">Summer staff</a>' % URL
    assert len(parse(html, source("Mount Hermon"))) == 1
    with pytest.raises(ValueError):
        parse(HTML.replace("58F6BA3B1C1AA25D186569BA421811AE", "UNRELATED"), source("Mount Hermon"))


def test_missing_sections_fail_visibly_not_healthy_zero():
    with pytest.raises(ValueError):
        parse("<h1>Sign in</h1>", source("Mount Hermon"))


def test_legacy_query_ids_are_preserved_and_cross_format_duplicates_removed():
    legacy = "https://www.paycomonline.net/v4/ats/web.php/jobs/ViewJobDetails?job=241610&amp;clientkey=58F6BA3B1C1AA25D186569BA421811AE"
    html = HTML.replace('<h2>Other Ways', '<a href="%s">Dining Server</a><h2>Other Ways' % legacy)
    rows = parse(html, source("Mount Hermon"))
    assert len(rows) == 2
    assert "job=241610&clientkey=" in rows[1]["url"]
    html = html.replace("241610", "460155")
    assert len(parse(html, source("Mount Hermon"))) == 1


def test_roaring_camp_categories_are_one_review_candidate():
    rows = parse("<h2>Current Positions Available:</h2><p>Food service, retail, ticket sales, crafts, janitorial staff</p><h3>Employment Office</h3>", source("Roaring Camp Railroads"))
    assert len(rows) == 1
    assert rows[0]["listing_kind"] == "employer_recruitment"
    assert rows[0]["review_required"] is True


def test_even_enabled_local_discovery_cannot_publish():
    outcomes = {}
    published, queued, counts = build_jobs(
        [dict(source("Mount Hermon"), enabled=True)],
        {"http_get": lambda url: HTML}, "2026-09-13",
        manual_path="__no_file__", diagnostics=outcomes)
    assert published == []
    assert queued[0]["_queue_reason"] == "employer-detail-review-required"
    assert queued[0]["verification_status"] == "pending-review"
    assert counts["Mount Hermon"] == 1
    assert outcomes["Mount Hermon"]["publication_candidates"] == 0
    assert outcomes["Mount Hermon"]["rejected"] == {"employer-detail-review-required": 1}


def test_source_failure_differs_from_empty_response():
    outcomes = {}
    build_jobs([dict(source("Mount Hermon"), enabled=True)],
               {"http_get": lambda url: "<h1>Unexpected shell</h1>"},
               "2026-09-13", manual_path="__no_file__", diagnostics=outcomes)
    assert outcomes["Mount Hermon"]["status"] == "fetch-or-parse-failed"


def test_new_sources_are_not_silently_activated():
    for name in ("Mount Hermon", "Roaring Camp Railroads", "YMCA Camp Campbell", "Scarborough Lumber careers"):
        assert not source(name)["enabled"]


def test_mixed_changed_ats_link_cannot_look_like_complete_discovery():
    html = HTML.replace('<h2>Other Ways', '<a href="https://new-ats.example/job/2">New job</a><h2>Other Ways')
    with pytest.raises(ValueError, match="Unexpected application destination"):
        parse(html, source("Mount Hermon"))
