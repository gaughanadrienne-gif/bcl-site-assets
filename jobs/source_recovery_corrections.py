"""Apply dated, owner-approved field corrections only to a matching recruitment.

This narrow register contains only seven approved Community Bridges recoveries. It is independent of the raw scraper. Unknown changed values or an
expired review move the record to the review queue instead of silently reverting
a known error. A daily rebuild never advances this field-review date.
"""
import json
from pathlib import Path
from jobs.identity import job_identity_url

REGISTER = Path(__file__).with_name('source-recovery-reviewed-corrections.json')
EXPECTED_RECOVERIES = {'c65b4d0c5ab456b2c477853d04bed934386c9d18': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/166292', '1f6b28ee88ab32b32ac2bf4c48f0a7b03a160a7b': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/173499', 'e6ccc829fda746d5a780cff79381fbee0f50303a': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/174016', '523f7482036363f2d2c14e89a1e734fbac1fcf16': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/174864', '0e2d590b4a1af79c8da1b339956e1fd50e937266': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/156968', 'd4f041613ce98c4b5d0d7a2e20df842f08c2f9d6': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/171346', '28e49edcbb7fcb6317b8458f8449ab0c80652dd2': 'https://www.paycomonline.net/v4/ats/web.php/portal/5FDAD4C9F20D7D00310983697A309125/jobs/174332'}

def validate_reviewed_register(records):
    urls, ids = set(), set()
    for record in records:
        url = job_identity_url(record['canonical_url'])
        if url in urls or record['id'] in ids:
            raise ValueError('duplicate reviewed recruitment identity')
        urls.add(url)
        ids.add(record['id'])
    return records

def load_recovery_register():
    records = json.loads(REGISTER.read_text(encoding='utf-8'))['corrections']

    validate_reviewed_register(records)
    if ({r['id']: r['canonical_url'] for r in records} != EXPECTED_RECOVERIES
            or any(r['source'] != 'Community Bridges' for r in records)):
        raise ValueError('recovery register must contain exactly the seven approved identities')
    return records

def apply_recovered_fields(job, today, register=None):
    records = load_recovery_register() if register is None else validate_reviewed_register(register)
    spec = next((r for r in records if job_identity_url(r['canonical_url']) == job_identity_url(job.get('canonical_url'))), None)
    if spec is None:
        return job, None
    result = dict(job)
    result['field_reviewed_at'] = spec['reviewed_at']
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
