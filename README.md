# bcl-site-assets

Public asset and tool layer for [Boulder Creek Local](https://bouldercreeklocal.com), served via jsDelivr into Squarespace code blocks. Same architecture as the sister businesses (ah-graphics, execops-brief-assets): GitHub + Squarespace, no app server.

## Layout

- `tools/bcl-tools.js` — single self-initializing script for all embedded tools. Renders into whichever div exists on the page:
  - `#bcl-directory` — searchable verified business directory
  - `#bcl-food` — food and drink listings
  - `#bcl-events` — upcoming verified events
  - `#bcl-status` — Mountain Status (live NWS alerts + forecast client-side, official links for roads/power/air)
  - `#bcl-jobs` — San Lorenzo Valley job board
  - `#bcl-rentals` — San Lorenzo Valley rentals board
  - `#bcl-home` + `#bcl-today` — homepage dashboard. `#bcl-today` shows current
    conditions and any active NWS alerts; the script then injects "The local
    board" (one section, three columns: next three events, three recently added
    jobs, three current rentals), the latest Around Town posts, and the
    consolidated Explore grid. These are runtime injections, so the Squarespace
    home code block stays as-is.
  - Around Town posts additionally get a "More from Around Town" card row under
    the body, ranked by shared category/tag then recency.
- `data/directory.json`, `data/food.json` — published listings only (high-confidence, owner-approved; internal review fields stripped; home-based businesses carry no address). Generated from the private research master; do not hand-edit records here without updating the master.
- `data/events.json` — owner-verified events only. Empty until events are confirmed with organizers.
- `data/articles.json` — reviewed article bodies. Squarespace holds approved native copies. Use the public native archive and the owner-maintained withdrawal list to establish which articles may appear in search and navigation.

## Embed snippet (Squarespace code block)

```html
<div id="bcl-directory"></div>
```

Use the div ID for the page. The sitewide footer already loads the tool script at an immutable commit SHA.

## Updating data

1. Use the appropriate data workflow and preserve unrelated records. Directory facts belong in the directory feed, with a human review before release.
2. For article edits, use the BCL article-rewrite runbook and update only the reviewed records. Verify the current native Squarespace body, the feed, and the signed-out result. Preserve withheld material and private draft handling notes.
3. Purge each changed data path once. Compare the served alias bytes with the immutable release, then check an affected record in the rendered page. Record delivery as unverified while the alias differs. Rebuild dependent search data from the released inputs.

The rentals publisher owns that ordinary purge. On the first verification attempt for a main-branch push, the delivery check can request one additional purge of `data/rentals.json` if the public feed repeatedly serves the exact previous rental file and the triggering rental version is still current. It verifies the ordinary public URL again afterward. HTTP errors, manual dispatches and reruns do not request a recovery purge.

## Releasing

Squarespace loads this script from **Code Injection > Footer**, pinned to an
immutable commit SHA, never `@main` — jsDelivr's `@main` edge caches lag per
region by up to twelve hours, so a push alone does not reach readers.

```bash
node --test "tools/tests/*.test.js"
git commit && git push                  # note the short SHA
curl -sI https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@<sha>/tools/bcl-tools.js
```

Then change the SHA in the `<script src>` line in Squarespace Code Injection >
Footer, in place. Do not paste the whole footer file over it; the live block
carries the ridge/parallax layer and other fixes. Mirror the new SHA in
`boulder-creek-local/squarespace/02_FOOTER.html`.

Roll back by repointing at the previous SHA. Old commits stay on jsDelivr
permanently, so rollback is one line.

To preview a release against the live site without publishing, open the page and
run this in the console — it affects only that tab:

```js
document.querySelectorAll('style[id^="bcl-tools-css"]').forEach(n => n.remove());
const s = document.createElement('script');
s.src = 'https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@<sha>/tools/bcl-tools.js';
document.body.appendChild(s);
```

## Rules

- Human review precedes publication. Nothing in `data/` goes live without owner approval.
- Missing data renders as "unavailable", never as an all-clear.
- Emergency content always routes to 911 and official agencies; the status tool links sources, it never interprets conditions.
- Never publish home addresses for home-based businesses. Inclusion is not endorsement.
