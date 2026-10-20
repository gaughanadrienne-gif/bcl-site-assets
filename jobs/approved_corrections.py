"""Apply dated, owner-approved field corrections only to a matching recruitment.

This register is independent of the raw scraper. Unknown changed values or an
expired review move the record to the review queue instead of silently reverting
a known error. A daily rebuild never advances this field-review date.
"""
import json
from pathlib import Path
from jobs.identity import job_identity_url

REGISTER = Path(__file__).with_name('approved-corrections.json')
ADDITIONAL_REGISTER = Path(__file__).with_name('additional-reviewed-corrections.json')

def validate_reviewed_register(records):
    urls, ids = set(), set()
    for record in records:
        url = job_identity_url(record['canonical_url'])
        if url in urls or record['id'] in ids:
            raise ValueError('duplicate reviewed recruitment identity')
        urls.add(url)
        ids.add(record['id'])
    return records

def load_reviewed_register():
    records = json.loads(REGISTER.read_text(encoding='utf-8'))['corrections']
    records += json.loads(ADDITIONAL_REGISTER.read_text(encoding='utf-8'))['corrections']
    return validate_reviewed_register(records)

def apply_reviewed_fields(job, today, register=None):
    records = load_reviewed_register() if register is None else validate_reviewed_register(register)
    spec = next((r for r in records if job_identity_url(r['canonical_url']) == job_identity_url(job.get('canonical_url'))), None)
    if spec is None:
        return job, None
    result = dict(job)
    if not (spec['reviewed_at'] <= today <= spec['expires_at']):
        return result, 'reviewed-fields-expired'
    if job.get('title') != spec['title'] or job.get('source') != spec['source']:
        return result, 'reviewed-fields-identity-conflict'
    for key, value in spec['fields'].items():
        if key in {'id', 'field_reviewed_at'}:
            continue
        presence = spec.get('accepted_presence', {}).get(key)
        if presence is not None:
            actual = {'present': key in result, 'value': result.get(key)}
            if actual not in presence:
                return result, 'reviewed-fields-source-conflict'
        elif result.get(key) not in spec['accepted'].get(key, [value]):
            return result, 'reviewed-fields-source-conflict'
    result.update(spec['fields'])
    result['field_reviewed_at'] = spec['reviewed_at']
    return result, None
