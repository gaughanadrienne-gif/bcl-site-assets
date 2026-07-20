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

def test_safeway_oracle_rest_url_is_verified_finder_call():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    safeway = by_name["Safeway (Albertsons)"]
    assert safeway["config"]["rest_url"] == (
        "https://eofd.fa.us6.oraclecloud.com/hcmRestApi/resources/latest/"
        "recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations"
        "&finder=findReqs;siteNumber=CX_1001,keyword=Santa Cruz,limit=25"
    )
    assert " " in safeway["config"]["rest_url"]  # keyword space must NOT be percent-encoded
    assert "%20" not in safeway["config"]["rest_url"]
    assert safeway["config"]["keyword"] == "Santa Cruz"
    assert safeway["config"]["job_url"] == (
        "https://www.albertsonscompanies.com/careers/find-a-job/job/{id}.html"
    )

def test_nob_hill_oracle_is_deferred_disabled():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    nobhill = by_name["Nob Hill Foods / Raley's"]
    assert nobhill["enabled"] is False
    assert nobhill["terms_ok"] is True
    assert "DEFERRED" in nobhill["notes"]

def test_bay_photo_dream_inn_seascape_have_no_dead_city_config():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    for name in ("Bay Photo Lab", "Dream Inn Santa Cruz", "Seascape Beach Resort"):
        assert "city" not in by_name[name]["config"], name

def test_central_fire_geo_resolves_to_employer_city():
    by_name = {s["name"]: s for s in JOB_SOURCES}
    central_fire = by_name["Central Fire District"]
    assert central_fire["geo"] == "employer:Santa Cruz"
