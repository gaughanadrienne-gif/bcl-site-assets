import pytest
from jobs.deadlines import deadline_day, job_is_expired
from jobs.normalize import include_job
from jobs.refresh_jobs import build_jobs

@pytest.mark.parametrize("value", ["2026-10-26", "10/26/2026", "10/26/26", "Monday, October 26, 2026 11:59 PM"])
def test_source_formats(value):
    assert deadline_day(value) == "2026-10-26"
    assert job_is_expired({"application_deadline":value}, "2026-10-27")
    assert not job_is_expired({"application_deadline":value}, "2026-10-26")

@pytest.mark.parametrize("value", [None, "", "Continuous", "Until Filled", "By Date", "October 26", "2026-02-30", "10/26/20267", "13/26/26"])
def test_unknown_or_invalid_never_asserts_closure(value):
    assert deadline_day(value) is None
    assert not job_is_expired({"application_deadline":value}, "2026-10-27")


def test_backend_rejects_closed_but_preserves_open_ended():
    row={"title":"Worker", "canonical_url":"https://example.org/1", "geography_tier":"core", "application_deadline":"10/26/26"}
    assert include_job(row, today="2026-10-27") == (False,"expired-deadline")
    assert include_job(dict(row, application_deadline="Until Filled"), today="2026-10-27") == (True,None)


def test_refresh_filters_automatic_and_manual_deadlines_without_new_verification(tmp_path, monkeypatch):
    import jobs.refresh_jobs as refresh
    source={"name":"Expiry fixture", "enabled":True,"parser":"expiry-fixture","platform":"remote_json","url":"https://example.org/feed"}
    def raw(title, deadline):
        return {"title":title,"url":"https://example.org/"+title,"city":"Felton","application_deadline":deadline}
    monkeypatch.setitem(refresh.PARSERS,"expiry-fixture",lambda data, source:[raw("expired-auto","10/26/26"),raw("future-auto","10/30/26"),raw("ongoing-auto","Until Filled")])
    manual=tmp_path/"manual.json"
    import json
    manual.write_text(json.dumps({"entries":[dict(raw("expired-manual","10/26/26"),approved=True,submitted_at="2026-10-20"),dict(raw("future-manual","10/30/26"),approved=True,submitted_at="2026-10-20")]}))
    public, private, _=build_jobs([source],{"http_json":lambda url:[]},"2026-10-27",manual_path=str(manual))
    assert {j["title"] for j in public} == {"future-auto","ongoing-auto","future-manual"}
    assert {j["title"] for j in private} == {"expired-auto","expired-manual"}
    assert all(j["_queue_reason"]=="expired-deadline" for j in private)
    assert next(j for j in public if j["title"]=="future-manual")["last_verified_at"] == "2026-10-20"


def test_extended_deadline_is_rechecked_instead_of_becoming_permanent_hold(monkeypatch):
    import jobs.refresh_jobs as refresh
    source={"name":"Expiry fixture", "enabled":True,"parser":"expiry-fixture","platform":"remote_json","url":"https://example.org/feed"}
    deadline=["10/26/26"]
    monkeypatch.setitem(refresh.PARSERS,"expiry-fixture",lambda data,source:[{"title":"Worker","url":"https://example.org/worker","city":"Felton","application_deadline":deadline[0]}])
    _, private, _=build_jobs([source],{"http_json":lambda url:[]},"2026-10-27",manual_path="__missing__.json")
    assert private[0]["_queue_reason"] == "expired-deadline"
    deadline[0]="11/06/26"
    public, private_after, _=build_jobs([source],{"http_json":lambda url:[]},"2026-10-28",manual_path="__missing__.json",previous_jobs=private)
    assert len(public)==1 and public[0]["application_deadline"]=="11/06/26"
    assert not private_after
