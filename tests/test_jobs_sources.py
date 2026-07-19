from jobs.sources import JOB_SOURCES
from shared.registry import validate_registry


def test_registry_validates():
    assert validate_registry(JOB_SOURCES) is JOB_SOURCES

def test_all_jobs_tool():
    assert all(s["tool"] == "jobs" for s in JOB_SOURCES)

def test_core_structured_sources_enabled():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    for name in ("County of Santa Cruz", "City of Scotts Valley", "SLVUSD (EDJOIN)",
                 "Second Harvest (RSS)", "Remotive (remote)"):
        assert by_name[name]["enabled"] is True, name

def test_discovery_sources_are_link_out_only():
    for s in JOB_SOURCES:
        if s["collection_class"] == "discovery_only":
            assert s["enabled"] is False

def test_remote_sources_have_remote_geo():
    for s in JOB_SOURCES:
        if s["platform"] == "remote_json" or s["name"].endswith("(remote)"):
            assert s["geo"] == "remote"
