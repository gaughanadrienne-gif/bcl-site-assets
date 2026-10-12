"""Apply dated, owner-approved field corrections only to a matching recruitment.

This register is independent of the raw scraper. Unknown changed values or an
expired review move the record to the review queue instead of silently reverting
a known error. A daily rebuild never advances this field-review date.
"""
import json
from pathlib import Path
from jobs.identity import job_identity_url

REGISTER = Path(__file__).with_name('approved-corrections.json')

def apply_reviewed_fields(job, today, register=None):
    records = register if register is not None else json.loads(REGISTER.read_text(encoding='utf-8'))['corrections']
    spec = next((r for r in records if job_identity_url(r['canonical_url']) == job_identity_url(job.get('canonical_url'))), None)
    if spec is None:
        return job, None
    result = dict(job)
    if not (spec['reviewed_at'] <= today <= spec['expires_at']):
        return result, 'reviewed-fields-expired'
    if job.get('title') != spec['title'] or job.get('source') != spec['source']:
        return result, 'reviewed-fields-identity-conflict'
    for key, value in spec['fields'].items():
        if key not in {'id','field_reviewed_at'} and result.get(key) not in spec['accepted'].get(key, [value]):
            return result, 'reviewed-fields-source-conflict'
    result.update(spec['fields'])
    result['field_reviewed_at'] = spec['reviewed_at']
    return result, None
