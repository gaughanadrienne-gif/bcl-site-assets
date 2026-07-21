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
    conditions and any active NWS alerts; the script then injects live strips for
    the next three events, three recently added jobs, three current rentals, and
    the latest Around Town posts, plus the consolidated Explore grid. These are
    runtime injections, so the Squarespace home code block stays as-is.
  - Around Town posts additionally get a "More from Around Town" card row under
    the body, ranked by shared category/tag then recency.
- `data/directory.json`, `data/food.json` — published listings only (high-confidence, owner-approved; internal review fields stripped; home-based businesses carry no address). Generated from the private research master; do not hand-edit records here without updating the master.
- `data/events.json` — owner-verified events only. Empty until events are confirmed with organizers.
- `data/articles.json` — rendered bodies for the 67 article URLs in the live Squarespace sitemap. The two drafts absent from the sitemap are emitted only in a withheld list so accidental placeholder URLs receive `noindex`.

## Embed snippet (Squarespace code block)

```html
<div id="bcl-directory"></div>
<script src="https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/tools/bcl-tools.js" defer></script>
```

Swap the div id per page. One script tag per page is enough for any number of tools.

## Updating data

1. Edit the research master + owner workbook (private, OneDrive), regenerate the public JSON, commit, push.
2. For article bodies, refresh `data/live-article-slugs.json` from the public Squarespace sitemap, then run `python scripts/build_articles.py --as-of YYYY-MM-DD`; the builder emits every live slug and withholds drafts absent from the sitemap.
3. Purge jsDelivr so changes appear promptly:
   `https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/directory.json` (repeat per changed file).

## Rules

- Human review precedes publication. Nothing in `data/` goes live without owner approval.
- Missing data renders as "unavailable", never as an all-clear.
- Emergency content always routes to 911 and official agencies; the status tool links sources, it never interprets conditions.
- Never publish home addresses for home-based businesses. Inclusion is not endorsement.
