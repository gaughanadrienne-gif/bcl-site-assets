import json
from copy import deepcopy
from pathlib import Path
from jobs.approved_corrections import apply_reviewed_fields
from jobs.normalize import include_job
from jobs.refresh_jobs import PUBLIC_SCHEMA_KEYS, build_jobs

SPECS=json.loads((Path(__file__).parents[1]/'jobs/approved-corrections.json').read_text())['corrections']

def original(spec):
    job={'title':spec['title'],'source':spec['source'],'canonical_url':spec['canonical_url']}
    job.update({k:v[0] for k,v in spec['accepted'].items()})
    return job

def test_register_applies_only_the_14_reviewed_recruitments():
    assert len(SPECS)==14
    for spec in SPECS:
        job=original(spec); before=deepcopy(job)
        patched,reason=apply_reviewed_fields(job,'2026-10-12')
        assert reason is None
        assert job==before
        assert all(patched[k]==v for k,v in spec['fields'].items())
        assert patched['field_reviewed_at']=='2026-10-12'

def test_review_does_not_override_conflicts_or_advance_its_date():
    spec=next(s for s in SPECS if 'city' in s['fields'])
    job=original(spec); job['city']='Unreviewed worksite'
    patched,reason=apply_reviewed_fields(job,'2026-10-13')
    assert reason=='reviewed-fields-source-conflict'
    assert patched['city']=='Unreviewed worksite'
    job=original(spec); job['title']='Different vacancy'
    assert apply_reviewed_fields(job,'2026-10-13')[1]=='reviewed-fields-identity-conflict'
    patched,reason=apply_reviewed_fields(original(spec),'2026-10-13')
    assert reason is None and patched['field_reviewed_at']=='2026-10-12'

def test_expired_review_goes_to_review_instead_of_reintroducing_known_bad_fields():
    spec=SPECS[0]
    assert apply_reviewed_fields(original(spec),'2026-11-12')[1]=='reviewed-fields-expired'
    assert apply_reviewed_fields(original(spec),'2026-10-11')[1]=='reviewed-fields-expired'

def test_remote_eligibility_is_retained_in_public_schema():
    for key in ['local_employer_verified','local_employer_evidence_url','field_reviewed_at']:
        assert key in PUBLIC_SCHEMA_KEYS
    spec=next(s for s in SPECS if s['fields'].get('work_mode')=='remote')
    job=original(spec); job['city']='Aptos'
    patched,reason=apply_reviewed_fields(job,'2026-10-12')
    assert reason is None
    patched['verification_status']='verified'
    assert include_job(patched)==(True,None)
    patched['local_employer_verified']=False
    assert include_job(patched)==(False,'remote-local-evidence-required')

def test_refresh_preserves_lifeguard_type_and_stable_id_and_queues_expiry(tmp_path):
    spec=next(s for s in SPECS if s['title']=='LIFEGUARD (Extra Help)')
    md='| ['+spec['title']+']('+spec['canonical_url']+') | Parks | $22 / Hour | None | Continuous | Open |'
    src={'name':'County of Santa Cruz','parser':'jobaps','platform':'jobaps','enabled':True,'url':'https://www.jobapscloud.com/SCRUZ/','geo':'area'}
    fetchers={'firecrawl_markdown':lambda url:md}
    manual=tmp_path/'none.json'
    pub,queued,_=build_jobs([src],fetchers,'2026-10-12',manual_path=manual)
    assert len(pub)==1 and not queued
    assert pub[0]['employment_type']=='Temporary' and pub[0]['id']==spec['id']
    pub,queued,_=build_jobs([src],fetchers,'2026-11-12',manual_path=manual)
    assert not pub and queued[0]['_queue_reason']=='reviewed-fields-expired'


def test_equivalent_source_urls_cannot_bypass_correction_or_expiry():
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
    spec=next(s for s in SPECS if 'jobapscloud' in s['canonical_url'])
    job=original(spec)
    parts=urlsplit(job['canonical_url'])
    query=list(reversed(parse_qsl(parts.query,keep_blank_values=True)))+[('utm_source','email')]
    job['canonical_url']=urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(query),''))
    patched,reason=apply_reviewed_fields(job,'2026-10-12')
    assert reason is None and patched['id']==spec['id']
    assert apply_reviewed_fields(job,'2026-11-12')[1]=='reviewed-fields-expired'
