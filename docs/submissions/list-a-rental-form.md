# /list-a-rental form spec (Squarespace native form)

This is the field list for a Squarespace native form block at
`/list-a-rental`. Submissions land in the form's notification inbox (route to
hello@) -- there is no backend and no auto-publish. A human validates every
submission (real landlord/manager, not a scam, fair-housing-clean) before
anything reaches `partials/manual-rentals.json` (see `WORKFLOW.md`).

## Fields

| # | Field (form label) | Type | Required | Maps to `manual-rentals.json` key |
|---|---|---|---|---|
| 1 | Your name | short text | yes | *(not published; contact-verification only)* |
| 2 | Your email | email | yes | *(not published; contact-verification only)* |
| 3 | Your relationship to the property (owner / property manager / leasing agent) | dropdown | yes | *(not published; contact-verification only)* |
| 4 | I have the authority to advertise this property for rent | checkbox | yes (must be checked) | *(gate: unchecked submissions are not forwarded to the manual partial)* |
| 5 | Property address | short text | yes | `address_public` |
| 6 | ZIP code | short text | yes | `postal_code` **-- the owner sets this to the property's San Lorenzo Valley ZIP (95005 Ben Lomond / 95006 Boulder Creek / 95007 Brookdale / 95018 Felton) in the manual partial ONLY after confirming the property is actually in that ZIP (see gate note below); the raw form value is a claim, not evidence** |
| 7 | Rental type (entire home / apartment / private room / shared) | dropdown | yes | `property_type` (+ feeds `rental_scope` classification) |
| 8 | Monthly rent | short text (number) | yes | `monthly_rent` |
| 9 | Security deposit | short text (number) | no | *(not currently a published field; keep for the human's own records)* |
| 10 | Bedrooms | short text (number) | yes | `bedrooms` |
| 11 | Bathrooms | short text (number) | yes | `bathrooms` |
| 12 | Available date | date | yes | `available_date` |
| 13 | Minimum lease term | short text (e.g. "12 months") | yes | `lease_term_text` |
| 14 | Description | long text | yes | `description` |
| 15 | Preferred contact method for applicants | short text | yes | *(scrubbed from published `description_summary` by `sanitize_text`/`scrub_pii`; kept only for the human's own follow-up)* |
| 16 | I will not discriminate based on any protected class (fair housing) and this listing complies with fair housing law | checkbox | yes (must be checked) | *(gate, paired with the automated `fair_housing_flags` scan on every refresh)* |
| 17 | I confirm the information above is accurate | checkbox | yes (must be checked) | *(gate)* |
| 18 | I understand this listing expires after 14 days unless I renew it | checkbox (acknowledgement) | yes (must be checked) | *(no stored key; sets expectations for the 14-day TTL)* |

## The San Lorenzo Valley gate (read this before touching `postal_code`)

`include_rental` only auto-publishes a listing when `is_slv()` returns
true -- an exact `postal_code` in {95005, 95006, 95007, 95018}, or one of
those ZIPs appearing in a structured address field. **The owner sets
`postal_code` in the manual entry only after independently confirming the
address is in that Valley ZIP** (a map lookup, not just trusting the form).
If the address can't be confirmed (or the submitter left it blank/vague) but
the town is clearly a Valley town, leave `postal_code` unset and set `city` to
the town (Boulder Creek / Ben Lomond / Brookdale / Felton) -- the listing will
queue for a second look (`undisclosed-slv-verify`) instead of auto-publishing.
A property confirmed OUTSIDE the Valley (Scotts Valley 95066, Santa Cruz
95060/95062, Watsonville 95076, etc.) should never be added to the manual
partial at all.

## Notes for the person processing submissions

- Run the description through the same eye a scraped listing gets: the
  automated `scam_flags` / `fair_housing_flags` gates (wire transfer, gift
  card, "no children", "no vouchers", protected-class preferences, etc.)
  still apply on the next refresh even after a human has approved the
  submission once -- a flagged listing queues instead of publishing.
- **Expiry: 14 days** from `submitted_at` (or `renewed_at` on renewal).
  Expired entries drop off the board automatically but stay in
  `manual-rentals.json`; a renewal (bump `renewed_at` to today) revives them.
- Never store the submitter's name/email/preferred-contact fields (#1/#2/#15)
  on the published listing.
