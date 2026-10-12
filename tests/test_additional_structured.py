import json
from copy import deepcopy
from pathlib import Path
import pytest

from jobs.approved_corrections import apply_reviewed_fields
from jobs.normalize import include_job
from jobs.refresh_jobs import build_jobs, PARSERS
from jobs.identity import job_identity_url
from shared.bcl_ingest import classify_geo, commute_minutes

ROOT=Path(__file__).parents[1]
SPECS=json.loads((ROOT/'jobs/additional-reviewed-corrections.json').read_text(encoding='utf-8'))['corrections']
FIXTURE=json.loads((ROOT/'tests/fixtures/additional-structured-contract.json').read_text(encoding='utf-8'))
JOBS=json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))['jobs']

def original(spec):
    # Reconstruct a parser input from the reviewed presence/value guard, without
    # publishing a full pre-correction data backup as a test fixture.
    row=deepcopy(next(j for j in JOBS if j['id']==spec['id']))
    for field, alternatives in spec['accepted_presence'].items():
        old=alternatives[0]
        if old['present']:row[field]=old['value']
        else:row.pop(field,None)
    row['field_reviewed_at']=''
    return row


def test_exact_register_scope_and_cross_register_identity():
    old=json.loads((ROOT/'jobs/approved-corrections.json').read_text(encoding='utf-8'))['corrections']
    assert len(old)==14 and len(SPECS)==52
    assert sum(len(s['review_ids']) for s in SPECS)==58
    all_specs=old+SPECS
    assert len({s['id'] for s in all_specs})==66
    assert len({job_identity_url(s['canonical_url']) for s in all_specs})==66
    held=json.loads((ROOT/'jobs/additional-reviewed-corrections.json').read_text(encoding='utf-8'))['held_record_groups']
    assert sum(len(h['review_ids']) for h in held)==5
    assert not ({h['record_id'] for h in held}&{s['id'] for s in SPECS})

@pytest.mark.parametrize('spec',SPECS,ids=lambda s:s['id'])
def test_guarded_candidate_round_trip_and_public_schema(spec):
    before=original(spec)
    untouched=deepcopy(before)
    candidate,reason=apply_reviewed_fields(before,'2026-10-12')
    assert reason is None and before==untouched
    assert all(candidate[k]==v for k,v in spec['fields'].items())
    assert candidate['field_reviewed_at']=='2026-10-12'
    assert include_job(candidate)==(True,None)
    after,reason=apply_reviewed_fields(candidate,'2026-10-13')
    assert reason is None and after==candidate
    staged=next(j for j in JOBS if j['id']==spec['id'])
    assert staged==candidate

def test_null_presence_is_distinct_from_missing_and_source_conflicts_queue():
    spec=next(s for s in SPECS if 'salary_max' in s['fields'] and s['accepted_presence']['salary_max'][0]['value'] is None)
    before=deepcopy(original(spec))
    assert apply_reviewed_fields(before,'2026-10-12')[1] is None
    missing=deepcopy(before);missing.pop('salary_max')
    assert apply_reviewed_fields(missing,'2026-10-12')[1]=='reviewed-fields-source-conflict'
    changed=deepcopy(before);changed['salary_max']=999999
    assert apply_reviewed_fields(changed,'2026-10-12')[1]=='reviewed-fields-source-conflict'
    assert apply_reviewed_fields(before,'2026-11-12')[1]=='reviewed-fields-expired'

def test_duplicate_registers_refuse_first_match_override():
    spec=deepcopy(SPECS[0]);duplicate=deepcopy(spec)
    duplicate['id']='different-id'
    duplicate['canonical_url']+='&utm_source=test' if '?' in duplicate['canonical_url'] else '?utm_source=test'
    with pytest.raises(ValueError,match='duplicate reviewed recruitment identity'):
        apply_reviewed_fields(original(SPECS[0]),'2026-10-12',[spec,duplicate])

def test_changed_cities_derive_only_from_existing_table():
    for spec in SPECS:
        if 'city' not in spec['fields']:continue
        row=next(j for j in JOBS if j['id']==spec['id'])
        assert row['location_precision']=='city'
        assert row['geography_tier']==classify_geo(row['city'])!='unknown'
        assert row['commute_minutes']==commute_minutes(row['city'])
        assert row['commute_type']=='drive'

def test_refresh_keeps_new_pay_corrections_and_stable_id(monkeypatch,tmp_path):
    spec=next(s for s in SPECS if 'salary_disclosed' in s['fields'])
    before=original(spec)
    raw={'title':before['title'],'employer':before['employer_name'],'city':before['city'],'url':before['canonical_url'],'salary_text':before['salary_text']}
    monkeypatch.setitem(PARSERS,'rss',lambda _raw,_source: [raw])
    source={'name':before['source'],'parser':'rss','platform':'rss','enabled':True,'url':'https://fixture.invalid','geo':'area'}
    pub,queued,_=build_jobs([source],{'http_get':lambda _: 'offline fixture'},'2026-10-12',manual_path=tmp_path/'none.json')
    assert not queued and len(pub)==1
    assert pub[0]['id']==before['id']
    assert all(pub[0][k]==v for k,v in spec['fields'].items())
    assert pub[0]['field_reviewed_at']=='2026-10-12'

def test_invalid_merged_register_fails_before_source_processing(monkeypatch,tmp_path):
    from jobs import approved_corrections as ac
    bad=tmp_path/'duplicate.json'
    bad.write_text(json.dumps({'corrections':[SPECS[0],SPECS[0]]}),encoding='utf-8')
    monkeypatch.setattr(ac,'ADDITIONAL_REGISTER',bad)
    calls=[]
    source={'name':'Fixture','parser':'rss','platform':'rss','enabled':True,'url':'https://fixture.invalid'}
    with pytest.raises(ValueError,match='duplicate reviewed recruitment identity'):
        build_jobs([source],{'http_get':lambda url:calls.append(url)},'2026-10-12',manual_path=tmp_path/'none.json')
    assert calls==[]

def test_directory_changes_preserve_identity_and_verified_dates():
    listings=json.loads((ROOT/'data/directory.json').read_text(encoding='utf-8'))['listings']
    for expected in FIXTURE['directory']:
        new=next(d for d in listings if d['name']==expected['name'])
        assert new[expected['field']]==expected['expected_value']
        assert new['verified_at']==expected['verified_at']
        assert 'id' not in new
