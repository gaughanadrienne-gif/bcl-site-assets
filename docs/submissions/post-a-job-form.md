# /post-a-job form spec (Squarespace native form)

This is the field list for a Squarespace native form block at `/post-a-job`.
Submissions land in the form's notification inbox (route to hello@) -- there
is no backend and no auto-publish. A human reads every submission before
anything reaches `partials/manual-jobs.json` (see `WORKFLOW.md`).

## Fields

| # | Field (form label) | Type | Required | Maps to `manual-jobs.json` key |
|---|---|---|---|---|
| 1 | Employer name | short text | yes | `employer` |
| 2 | Employer website | short text (URL) | no | *(reference only; not stored on the listing)* |
| 3 | Your name (submitter) | short text | yes | *(not published; contact-verification only)* |
| 4 | Your email (authorized to post on the employer's behalf) | email | yes | *(not published; contact-verification only)* |
| 5 | Job title | short text | yes | `title` |
| 6 | Work location / city | short text | yes | `city` |
| 7 | Work mode | dropdown: On-site / Hybrid / Remote | yes | `work_mode` (+ `remote` = true when "Remote" is chosen) |
| 8 | Employment type / hours | short text (e.g. "Full-time, 40 hrs/wk") | yes | `hours_text` |
| 9 | Job description | long text | yes | `description` |
| 10 | Salary or "not provided" | short text | no | `salary_text` (leave blank/"not provided" -> `salary_disclosed=False`, never rejected for missing pay) |
| 11 | Benefits (optional) | long text | no | `benefits_text` |
| 12 | Application URL or email | short text | yes | `url` (an application email is stored as `mailto:` in `url`) |
| 13 | Date posted | date | no | `date_posted` (defaults to submission date if left blank) |
| 14 | Closing date / "until filled" | short text | no | `application_deadline` |
| 15 | Category (optional: retail, food service, trades, office, healthcare, education, other) | dropdown | no | `category` |
| 16 | I am authorized to post this listing on behalf of the employer | checkbox | yes (must be checked) | *(gate: unchecked submissions are not forwarded to the manual partial)* |
| 17 | I accept the Boulder Creek Local listing terms (no MLM/pay-to-start/commission-only roles, accurate pay/location info) | checkbox | yes (must be checked) | *(gate, same reason)* |

## Notes for the person processing submissions

- A submission is **raw input, not a publish action**. Copy the mapped
  fields into a `manual-jobs.json` entry (or into the review queue +
  `promote_submissions.py`, see `WORKFLOW.md`) only after confirming the
  employer/role looks legitimate.
- The listing still runs through `normalize_job` / `include_job` on the next
  refresh -- an out-of-area city (`geography_tier == "unknown"`) or an
  excluded keyword (MLM, pay-to-start, commission-only, etc.) will queue the
  submission for a second look even if a human already approved it once.
- **Expiry: 30 days** from `submitted_at` (or `renewed_at` if the employer
  renews). Expired entries drop off the published board automatically but
  stay in `manual-jobs.json` -- a renewal (bump `renewed_at` to today) revives
  them without re-entering all the fields.
- Never store the submitter's name/email fields (#3/#4) on the published
  listing -- they exist only so a human can verify authorization to post,
  matching the PII-scrub rule already applied to scraped listings.
