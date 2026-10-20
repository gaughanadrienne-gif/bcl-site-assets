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
NON_PUBLIC={c['id']:c for c in FIXTURE['non_public_job_contracts']}

def contract_job(spec):
    live=next((j for j in JOBS if j['id']==spec['id']),None)
    return deepcopy(live if live is not None else NON_PUBLIC[spec['id']]['after'])

def original(spec):
    # Reconstruct a parser input from the reviewed presence/value guard, without
    # publishing a full pre-correction data backup as a test fixture.
    row=contract_job(spec)
    for field, alternatives in spec['accepted_presence'].items():
        old=alternatives[0]
        if old['present']:row[field]=old['value']
        else:row.pop(field,None)
    row['field_reviewed_at']=''
    return row


def test_exact_register_scope_and_cross_register_identity():
    old=json.loads((ROOT/'jobs/approved-corrections.json').read_text(encoding='utf-8'))['corrections']
    assert len(old)==14 and len(SPECS)==55
    assert sum(len(s['review_ids']) for s in SPECS)==63
    all_specs=old+SPECS
    assert len({s['id'] for s in all_specs})==69
    assert len({job_identity_url(s['canonical_url']) for s in all_specs})==69
    held=json.loads((ROOT/'jobs/additional-reviewed-corrections.json').read_text(encoding='utf-8'))['held_record_groups']
    assert held==[]
    routed=json.loads((ROOT/'jobs/additional-reviewed-corrections.json').read_text(encoding='utf-8'))['recoverable_review_groups']
    assert len(routed)==3 and sum(len(r['review_ids']) for r in routed)==5
    assert not ({h['record_id'] for h in held}&{s['id'] for s in SPECS})

@pytest.mark.parametrize('spec',SPECS,ids=lambda s:s['id'])
def test_guarded_candidate_round_trip_and_public_schema(spec):
    before=original(spec)
    untouched=deepcopy(before)
    candidate,reason=apply_reviewed_fields(before,'2026-10-12')
    assert reason is None and before==untouched
    assert all(candidate[k]==v for k,v in spec['fields'].items())
    assert candidate['field_reviewed_at']=='2026-10-12'
    assert include_job(candidate)==((False,'ambiguous-location') if spec.get('routing') else (True,None))
    after,reason=apply_reviewed_fields(candidate,'2026-10-13')
    assert reason is None and after==candidate
    staged=contract_job(spec)
    if spec['id'] in NON_PUBLIC:
        for key,value in spec['fields'].items():assert staged[key]==candidate[key]==value
    else:assert staged==candidate

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
        row=contract_job(spec)
        assert row['location_precision']=='city'
        assert row['geography_tier']==classify_geo(row['city'])
        assert (row['geography_tier']=='unknown')==bool(spec.get('routing'))
        assert row['commute_minutes']==commute_minutes(row['city'])
        assert row['commute_type']==('drive' if row['commute_minutes'] is not None else None)

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


@pytest.mark.parametrize('spec',[s for s in SPECS if s.get('routing')],ids=lambda s:s['id'])
def test_approved_unknown_worksites_persist_in_recoverable_review(monkeypatch,tmp_path,spec):
    before=original(spec)
    raw={'title':before['title'],'employer':before['employer_name'],'city':before['city'],
         'work_mode':before['work_mode'],'url':before['canonical_url'],
         'salary_text':before['salary_text']}
    monkeypatch.setitem(PARSERS,'rss',lambda _raw,_source:[raw])
    source={'name':before['source'],'parser':'rss','platform':'rss','enabled':True,
            'url':'https://fixture.invalid','geo':'area'}
    before['first_seen_at']='2026-09-13'
    pub,queued,_=build_jobs([source],{'http_get':lambda _:'offline fixture'},'2026-10-13',manual_path=tmp_path/'none.json',previous_jobs=[before])
    assert pub==[] and len(queued)==1
    job=queued[0]
    assert job['id']==spec['id'] and job['canonical_url']==spec['canonical_url']
    assert all(job[k]==v for k,v in spec['fields'].items())
    assert job['_queue_reason']=='ambiguous-location'
    assert job['verification_status']=='pending-review'
    assert job['field_reviewed_at']=='2026-10-12'
    assert job['first_seen_at']=='2026-09-13'
    assert job['commute_minutes'] is None and job['commute_type'] is None
    # Later scraping cannot turn the expired review back into a public Aptos/Santa Cruz job.
    later_pub,later_queue,_=build_jobs([source],{'http_get':lambda _:'offline fixture'},'2026-11-12',manual_path=tmp_path/'none.json',previous_jobs=queued)
    assert later_pub==[] and len(later_queue)==1
    assert later_queue[0]['_queue_reason']=='reviewed-fields-expired'
    assert later_queue[0]['first_seen_at']=='2026-09-13'


def test_current_feed_preserves_refresh_removals_and_routed_record_identity():
    assert len({j['id'] for j in JOBS})==len(JOBS)
    assert json.loads((ROOT/'data/jobs.json').read_text(encoding='utf-8'))['count']==len(JOBS)
    routed=set(FIXTURE['approved_review_routing_ids'])
    absent={c['id'] for c in FIXTURE['non_public_job_contracts'] if c['reason']=='not-present-in-current-source'}
    assert len(routed)==3 and len(absent)==7
    assert not (set(j['id'] for j in JOBS)&routed)
    # Other source-absent recruitments may legitimately return; do not ban their IDs.
    assert all(NON_PUBLIC[rid]['after']['geography_tier']=='unknown' for rid in routed)
    assert all(NON_PUBLIC[rid]['after']['commute_minutes'] is None for rid in routed)
