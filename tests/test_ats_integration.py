"""End-to-end test of build_jobs against a subset of real ATS sources, using
injected fetchers that replay the captured fixtures. Confirms: local roles
publish, non-local roles from the SAME employer are filtered out by the
geography gate, and a single-site employer with no per-job city resolves via
the employer geo hint.
"""

import json
import os

from jobs.refresh_jobs import build_jobs
from jobs.sources import JOB_SOURCES

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(_FIXTURES, name), encoding="utf-8") as fh:
        return fh.read()


def _by_name(*names):
    by_name = {s["name"]: s for s in JOB_SOURCES}
    return [by_name[n] for n in names]


def _fake_http_json(url):
    with open(os.path.join(_FIXTURES, "oracle_safeway.json"), encoding="utf-8") as fh:
        return json.load(fh)


def _fake_http_post_json(url, body):
    with open(os.path.join(_FIXTURES, "workday_foxfactory.json"), encoding="utf-8") as fh:
        return json.load(fh)


def _fake_firecrawl(url, wait_ms=0):
    if "dayforce" in url:
        return _read("dayforce_newleaf.md")
    if "paylocity" in url:
        return _read("paylocity_dreaminn.md")
    raise AssertionError("unexpected firecrawl url in test: %s" % url)


def _fetchers():
    return {
        "http_json": _fake_http_json,
        "http_post_json": _fake_http_post_json,
        "firecrawl_markdown": _fake_firecrawl,
        "http_get": lambda url: (_ for _ in ()).throw(AssertionError("http_get not expected: %s" % url)),
    }


def test_local_roles_publish_and_nonlocal_roles_are_filtered():
    sources = _by_name("Fox Factory", "New Leaf Community Markets", "Safeway (Albertsons)")
    published, queued = build_jobs(sources, _fetchers(), "2026-07-19", manual_path="__no_such_file__.json")

    # Fox Factory (Workday): a Scotts Valley... wait, fixture has no Scotts
    # Valley row -- it has Burnaby (BC, unknown), Jenks (OK, unknown), and a
    # multi-location row (blank city, unknown). None are local, so Fox
    # Factory contributes nothing to `published` and everything to `queued`.
    fox_published = [j for j in published if j["employer_name"] == "Fox Factory"]
    assert fox_published == []
    fox_queued = [j for j in queued if j["employer_name"] == "Fox Factory"]
    assert len(fox_queued) == 3
    assert all(j["_queue_reason"] == "ambiguous-location" for j in fox_queued)

    # New Leaf Community Markets (Dayforce): Santa Cruz/Aptos/Capitola roles
    # publish; the Half Moon Bay role does not.
    newleaf_published = [j for j in published if j["employer_name"] == "New Leaf Community Markets"]
    assert len(newleaf_published) >= 5
    assert all(j["geography_tier"] in ("core", "extended") for j in newleaf_published)
    assert not any(j["city"] == "Half Moon Bay" for j in newleaf_published)
    half_moon_bay_queued = [j for j in queued if j["city"] == "Half Moon Bay"]
    assert len(half_moon_bay_queued) == 1

    # Safeway (Oracle): Los Gatos + Soquel are local and publish; the
    # geo-gate would also drop a Nogales/AZ row if the fixture had one within
    # this employer's rows (it does not in this trimmed fixture).
    safeway_published = [j for j in published if j["employer_name"] == "Safeway (Albertsons)"]
    assert {j["city"] for j in safeway_published} == {"Los Gatos", "Soquel"}


def test_single_site_paylocity_resolves_city_from_employer_geo_hint():
    sources = _by_name("Dream Inn Santa Cruz")
    published, queued = build_jobs(sources, _fetchers(), "2026-07-19", manual_path="__no_such_file__.json")
    assert len(published) == 1
    job = published[0]
    assert job["title"] == "Front Desk Agent"
    assert job["city"] == "Santa Cruz"
    assert job["geography_tier"] == "core"
