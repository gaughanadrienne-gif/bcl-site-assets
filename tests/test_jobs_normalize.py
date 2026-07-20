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


def test_remote_job_tier_is_remote():
    raw = _raw(city="", remote=True, work_mode="remote", eligibility_text="USA",
               url="https://remotive.com/remote-jobs/x")
    job = normalize_job(raw, REMOTE_SOURCE, TODAY)
    assert job["geography_tier"] == "remote"
    assert job["commute_minutes"] is None


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
