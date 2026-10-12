# October 12 BCL priority audit fixes

The candidate corrects Pacific opening-hours checks and calendar instants, current extra-help schedule filters and 14 reviewed job records. It removes four decorative orange accents while retaining keyboard focus styles and all watercolor assets. It also separates seasonal rainfall from drainage engineering and suppresses rankings when observations are incomplete.

Five existing article records are corrected: El Niño (October 8 CPC advisory, November 12 next update), Library (October 13 official event and September cancellation), rain (dated July 2026 estimate), Halloween (owner-confirmed October 31, 5–7 p.m.; BCBA page labelled 2025 background), Sawmill (Closed August 2026 title, artwork preserved).

Per-record review dates remain separate from build/content dates. Events' October 9 date already agrees with its last material source commit, so events.json is unchanged. Directory's former September 26 label predates its last material data commit, 9e80482 on October 8; only that label is corrected. No directory verification date advances.

The reviewed jobs register matches normalized recruitment URLs, keeps stable IDs, records October 12 field-review dates, and expires November 11. A changed reviewed field/title/source or expired review goes to the existing review queue. A feed rebuild does not renew the review.

Validation: node --test "tools/tests/*.test.js"; the focused Python jobs/parser/rain/correction suite; scripts.build_article_meta --check; scripts.regenerate_drafts (check-only). Exact results and before/after scope ledger are retained in the BCL OneDrive October 12 audit-fix folder.

## Release gates

1. Re-read remote main and the affected public job records. Reconcile newer source/data edits by stable identity before release.
2. Review this draft PR, then merge only after the release review. No merge or deployment was performed by the implementer.
3. Mirror the approved jobs correction helper/register and guarded normalization/refresh changes into the scheduled Website/bcl-site-assets checkout using a before-hash patch. The scheduled wrapper runs that checkout, which contains unrelated changes. A GitHub merge alone does not update that runtime.
4. Verify immutable-SHA CDN tool bytes, then surgically repin the existing Squarespace Footer through its native editor. Data stays on @main; purge each changed data path once and compare served content.
5. Complete the paired native CMS body and metadata writes from cms-ready using Squarespace runner, expected before/after SHA gates, unchanged publish state, a canary and public readback. Publish static /rain correction too. Existing native bodies override feed bodies, so feed deployment alone does not complete the article changes.
6. Disable /member-site-homepage-1-2 and /new-page recoverably, confirm /member-site-homepage-1-2-1 remains disabled, and verify exact sitemap removal. Leave the private /road pilot and gate alone.
7. Complete desktop and 390px browser checks on Home, Jobs, Rentals, Directory, Food, Events, Rain and one article. Verify focus, remote card/search wording, temporary Lifeguards, preserved artwork and signup blocks. Visual acceptance is outstanding because browser control disconnected.

Rollback: repoint the Footer to its observed previous pin 234dc2a1260a28c2f1b95587ff2dc1a8f723cdcd; restore the corresponding pre-release data/native bodies together. The three test pages are retained and can be re-enabled through Page Settings. No permanent deletion is involved.
