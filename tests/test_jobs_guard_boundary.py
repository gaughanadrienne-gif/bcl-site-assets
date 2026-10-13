"""Narrow guard release acceptance, offline; no scheduler or source fetch."""
from copy import deepcopy
from pathlib import Path
import hashlib
import json

import pytest

from jobs import refresh_jobs as refresh
from jobs.parsers import paycom
from jobs.normalize import normalize_job
from jobs.source_recovery_corrections import load_recovery_register
from jobs.sources import JOB_SOURCES

SOURCE = next(s for s in JOB_SOURCES if s['name'] == 'Community Bridges')
FIXTURE = Path(__file__).resolve().parents[1] / 'review/guard-private-inputs.json'
TODAY = '2026-10-13'
# Immutable owner-approved c1 subset, independently matched during release review.
APPROVED_SUBSET_SHA256 = '24d4cd3d4a7bdc88dfb6ba61989ae9752e75c6ba985a1f0e6408d20ed432dc57'


def inputs():
    if not FIXTURE.exists():
        # Portable synthetic pipeline fixture; local release acceptance instead
        # uses the preserved index capture and exact private recovery snapshots.
        specs = load_recovery_register()
        rows = [{'title': s['title'], 'employer': SOURCE['name'], 'city': 'Santa Cruz',
                 'url': s['canonical_url'], 'salary_text': ''} for s in specs]
        before = [normalize_job(r, SOURCE, '2026-10-12') for r in rows]
        for old, spec in zip(before, specs):
            old.update(spec['fields'])
            old.update(first_seen_at='2026-09-13', field_reviewed_at=spec['reviewed_at'], _source_review_required=True,
                       _queue_reason='source-response-unverified')
        return {'original_specs': specs}, before, rows, None
    data = json.loads(FIXTURE.read_text(encoding='utf-8'))
    text = Path(data['fixture']).read_text(encoding='utf-8')
    assert hashlib.sha256(Path(data['fixture']).read_bytes()).hexdigest() == data['fixture_sha256']
    before = json.loads(Path(data['recovery']).read_text(encoding='utf-8'))['source_records']
    raw = data['historical_parser_rows']
    known = {j['canonical_url'] for j in before}
    rows = [r for r in raw if r['url'] in known]
    assert len(rows) == len(before) == 7
    return data, before, rows, text


def build(rows, before, today=TODAY, monkeypatch=None):
    if monkeypatch is not None:
        monkeypatch.setitem(refresh.PARSERS, 'paycom', lambda *a: rows)
    return refresh.build_jobs([SOURCE], {'firecrawl_markdown': lambda *a, **k: rows}, today,
                              manual_path='__no_manual__.json', previous_jobs=before)


def test_seven_record_scope_matches_preserved_review_exactly():
    data, before, _, _ = inputs()
    specs = load_recovery_register()
    assert len(specs) == 7
    assert hashlib.sha256(json.dumps(specs,sort_keys=True,separators=(',',':')).encode()).hexdigest() == APPROVED_SUBSET_SHA256
    assert {s['id'] for s in specs} == {j['id'] for j in before}
    assert all(s['source'] == 'Community Bridges' and s['fields']['salary_period'] == 'hour' for s in specs)
    assert all(s['reviewed_at'] == '2026-10-12' and s['expires_at'] == '2026-11-11' for s in specs)
    assert specs == data['original_specs']


def test_historical_cb_reappearance_preserves_all_approved_fields(monkeypatch):
    _, before, rows, _ = inputs()
    published, queued, _ = build(rows, before, monkeypatch=monkeypatch)
    assert len(published) == 7 and not queued
    previous = {j['canonical_url']: j for j in before}
    for job in published:
        old = previous[job['canonical_url']]
        assert job['id'] == old['id'] and job['first_seen_at'] == old['first_seen_at']
        assert job['field_reviewed_at'] == old['field_reviewed_at'] == '2026-10-12'
        assert job['last_verified_at'] == TODAY
        for spec in load_recovery_register():
            if spec['id'] == job['id']:
                assert all(job[k] == v for k, v in spec['fields'].items())
        assert not any(k.startswith('_source') or k == '_queue_reason' for k in job)


def test_cb_source_pay_conflict_stays_private_with_old_identity_and_review_date(monkeypatch):
    _, before, rows, _ = inputs()
    changed = deepcopy(rows)
    for row in changed: row['salary_text'] = '$999 per hour'
    published, queued, _ = build(changed, before, monkeypatch=monkeypatch)
    assert not published and len(queued) == 7
    assert {j['id'] for j in queued} == {j['id'] for j in before}
    assert all(j['_queue_reason'] == 'reviewed-fields-source-conflict' for j in queued)
    assert all(j['field_reviewed_at'] == '2026-10-12' for j in queued)


def test_cb_review_expiry_stays_private_without_renewal(monkeypatch):
    _, before, rows, _ = inputs()
    published, queued, _ = build(rows, before, today='2026-11-12', monkeypatch=monkeypatch)
    assert not published and len(queued) == 7
    assert {j['id'] for j in queued} == {j['id'] for j in before}
    assert all(j['_queue_reason'] == 'reviewed-fields-expired' for j in queued)
    assert all(j['field_reviewed_at'] == '2026-10-12' for j in queued)


def test_repeated_cb_failure_preserves_actual_seven_snapshots(monkeypatch):
    _, before, _, _ = inputs()
    for day in ('2026-10-13', '2026-10-14'):
        published, queued, _ = build([], before, today=day, monkeypatch=monkeypatch)
        assert not published and len(queued) == 7
        for old, job in zip(before, queued):
            for key in ('id','first_seen_at','last_verified_at','field_reviewed_at','salary_min','salary_max','salary_text','salary_period'):
                assert job[key] == old[key]
        before = queued


@pytest.mark.parametrize('alteration', ['omit', 'add', 'wrong-source', 'wrong-url'])
def test_narrow_register_cannot_silently_widen_or_drop_guard(monkeypatch, tmp_path, alteration):
    from jobs import source_recovery_corrections as helper
    specs = deepcopy(load_recovery_register())
    if alteration == 'omit': specs.pop()
    elif alteration == 'add': specs.append(dict(specs[0],id='unexpected',canonical_url='https://other.example/job'))
    elif alteration == 'wrong-source': specs[0]['source'] = 'Unapproved source'
    else: specs[0]['canonical_url'] = 'https://other.example/job'
    path=tmp_path/'register.json'; path.write_text(json.dumps({'corrections':specs}),encoding='utf-8')
    monkeypatch.setattr(helper,'REGISTER',path)
    with pytest.raises(ValueError): helper.load_recovery_register()
