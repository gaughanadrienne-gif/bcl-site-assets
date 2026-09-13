from jobs.normalize import normalize_job, include_job

TODAY = "2026-07-19"

CORE_SOURCE = {"name": "County of Santa Cruz", "platform": "jobaps"}
REMOTE_SOURCE = {"name": "Remotive (remote)", "platform": "remote_json"}


def _raw(**overrides):
    base = {
        "title": "Public Health Nurse III", "employer": "County of Santa Cruz",
        "location_text": "Santa Cruz County", "city": "Santa Cruz",
        "url": "https://jobapscloud.com/SCRUZ/sup/bulpreview.asp?R1=26",
        "date_posted": "2026-07-17", "salary_text": "$19.94 Per Hour",
        "benefits_text": "", "hours_text": "Full-Time",
        "description": "Serves Santa Cruz County residents.",
        "work_mode": "on-site", "remote": False, "eligibility_text": "",
    }
    base.update(overrides)
    return base


def test_core_city_normalizes_with_commute():
    job = normalize_job(_raw(), CORE_SOURCE, TODAY)
    assert job["geography_tier"] == "core"
    assert job["commute_minutes"] == 30  # Santa Cruz, per data/commute_table.json


def test_generic_remote_is_not_local_and_requires_evidence():
    raw = _raw(city="", remote=True, work_mode="remote", eligibility_text="USA",
               url="https://remotive.com/remote-jobs/x")
    job = normalize_job(raw, REMOTE_SOURCE, TODAY)
    assert job["geography_tier"] == "unknown"
    assert job["commute_minutes"] is None
    assert include_job(job) == (False, "remote-local-evidence-required")


def test_reviewed_local_employer_remote_keeps_local_geography():
    raw = _raw(city="Boulder Creek", remote=True, work_mode="remote",
               eligibility_text="California", local_employer_verified=True,
               local_employer_evidence_url="https://employer.example/careers/1")
    job = normalize_job(raw, CORE_SOURCE, TODAY)
    assert job["geography_tier"] == "core"
    assert job["work_mode"] == "remote"
    assert job["commute_minutes"] is None
    assert include_job(job) == (True, None)


def test_remote_evidence_gate_fails_closed():
    base = dict(city="Santa Cruz", remote=True, work_mode="remote",
                eligibility_text="California", local_employer_verified=True,
                local_employer_evidence_url="https://employer.example/careers/1")
    for changes in [
        {"local_employer_verified": "true"},
        {"local_employer_evidence_url": "http://employer.example/1"},
        {"local_employer_evidence_url": "https://bad host/1"},
        {"local_employer_evidence_url": "https://user:pass@example.org/1"},
        {"eligibility_text": "USA"}, {"eligibility_text": "Worldwide"},
        {"eligibility_text": "USA excluding California"},
        {"eligibility_text": "California; not eligible"},
        {"city": "Fresno"}, {"city": ""},
    ]:
        job = normalize_job(_raw(**(base | changes)), CORE_SOURCE, TODAY)
        assert include_job(job)[0] is False, changes


def test_work_mode_alone_cannot_bypass_remote_gate():
    job = normalize_job(_raw(remote=False, work_mode="Remote"), CORE_SOURCE, TODAY)
    assert include_job(job) == (False, "remote-local-evidence-required")


def test_reviewed_remote_extended_city_keeps_extended_tier():
    job = normalize_job(_raw(city="Watsonville", remote=True, eligibility_text="California; Oregon",
                             local_employer_verified=True,
                             local_employer_evidence_url="https://employer.example/careers"), CORE_SOURCE, TODAY)
    assert job["geography_tier"] == "extended"
    assert include_job(job) == (True, None)


def test_hourly_salary_parses():
    job = normalize_job(_raw(salary_text="$19.94 Per Hour"), CORE_SOURCE, TODAY)
    assert job["salary_min"] == 19.94 and job["salary_max"] == 19.94
    assert job["salary_period"] == "hour" and job["salary_disclosed"] is True


def test_missing_salary_never_drops_job():
    job = normalize_job(_raw(salary_text=""), CORE_SOURCE, TODAY)
    assert job["salary_disclosed"] is False
    assert job["salary_text"] == ""
    ok, reason = include_job(job)
    assert ok is True  # BCL rule: no pay floor, never drop for missing pay


def test_mlm_title_excluded():
    job = normalize_job(_raw(title="Earn from home - Join our MLM team today"), CORE_SOURCE, TODAY)
    ok, reason = include_job(job)
    assert ok is False and reason == "excluded-keyword"


def test_unknown_city_routes_to_queue():
    job = normalize_job(_raw(city="Fresno"), CORE_SOURCE, TODAY)
    assert job["geography_tier"] == "unknown"
    ok, reason = include_job(job)
    assert ok is False and reason == "ambiguous-location"


def test_employer_geo_hint_fills_empty_city():
    single_site_source = {"name": "Dream Inn Santa Cruz", "platform": "paylocity", "geo": "employer:Santa Cruz"}
    job = normalize_job(_raw(city=""), single_site_source, TODAY)
    assert job["city"] == "Santa Cruz"
    assert job["geography_tier"] == "core"


def test_empty_city_without_employer_hint_is_unknown():
    job = normalize_job(_raw(city=""), CORE_SOURCE, TODAY)
    assert job["city"] == ""
    assert job["geography_tier"] == "unknown"
