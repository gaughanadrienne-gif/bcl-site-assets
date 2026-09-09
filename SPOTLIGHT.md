# The homepage business spotlight

One business a week, on the homepage, above "Latest from Around Town". The card
shows the business name, the article's own header image, a short blurb, and a
link to the spotlight article.

You control which business shows, and when, by editing one file:
**`data/spotlight.json`**.

## When it changes over

**Every Wednesday at midnight, Boulder Creek time.**

That is deliberate. You post the spotlight to social on Thursday, so the
homepage needs to already be showing that business when the post goes out.
Wednesday midnight gives a full day of margin. The card stays up through
Tuesday night, then the next week's business takes over.

It changes at midnight *here*, not midnight wherever the reader happens to be.
Someone opening the site from London or Tokyo sees the same business you are
posting about, not next week's or last week's.

## Adding next week's business

Open `data/spotlight.json` and add a block to the `schedule` list. Copy an
existing one and change the four values:

```json
{
  "week": "2026-11-04",
  "slug": "bowzer-baths-boulder-creek",
  "business": "Bowzer Baths",
  "blurb": "In April 2020 the shop asked for $1,700 to get through the shutdown. Twenty-five people sent $1,875."
}
```

- **`week`** is the **Wednesday** the card goes live, written `YYYY-MM-DD`.
  Use a Wednesday. If you use another day the card still appears, but it starts
  on the Wednesday *before* the date you typed, which is probably not what you
  meant.
- **`slug`** is the last part of the article's web address. For
  `bouldercreeklocal.com/around-town/bowzer-baths-boulder-creek` the slug is
  `bowzer-baths-boulder-creek`. It has to be an article that is already live.
- **`business`** is the name as you want it to read on the card. Short is
  better; it sits on one or two lines.
- **`blurb`** is the reason to click. Two or three sentences, drawn from
  something specific in the article. If the sentence could describe any shop in
  town, it will not earn a click. Roughly 60 to 260 characters.

Keep the weeks in order, one week apart. The card does not need an image: it
uses the article's own header image automatically, so there is nothing to
upload.

## If you forget to add one

**The card quietly disappears.** Nothing breaks and nothing looks wrong. The
homepage simply goes back to the layout it had before, with the rain card
running straight into "Latest from Around Town". Nobody sees an empty box, a
placeholder, or last week's business hanging around past its date.

The same thing happens if anything else is not right: a slug that does not match
a live article, a missing blurb, a typo in the date, or the file failing to load
at all. In every one of those cases the card shows nothing rather than showing
something wrong. That is on purpose. Add a new week whenever you notice, and it
comes back on the next Wednesday it covers.

## Two things to watch

**Articles that are mid-correction.** The `_hold_slugs` list at the top of
`data/spotlight.json` names articles that should not be scheduled yet. As of
2026-09-09 that is Air & Fire, Wild Lilith, Good Vibes and Boulder Creek Golf &
Country Club. Take a slug off that list once its correction is published.

**Pick articles that are actually spotlights.** The kicker on the card reads
"This week's business spotlight", so an article that is a guide or a history
piece will read oddly under it. The seeded weeks all come from the Business
Spotlights category.

## The running order as seeded

| Week of | Business |
|---|---|
| Wed 2026-09-09 | Viscosity Art Glass |
| Wed 2026-09-16 | Boulder Creek Pharmacy |
| Wed 2026-09-23 | Herrick Games and Hobbies |
| Wed 2026-09-30 | Boulder Creek Veterinary Clinic |
| Wed 2026-10-07 | Springygirl |
| Wed 2026-10-14 | Stumptown Supply |
| Wed 2026-10-21 | The Mat |
| Wed 2026-10-28 | Bowzer Baths |

After 2026-10-28 the order runs out and the card stops appearing until someone
adds more weeks.

## For whoever maintains the code

- Rendering lives in `tools/bcl-tools.js`: `spotlightWeekStart`,
  `spotlightPick`, `spotlightCardHTML`, `initHomeSpotlight`, wired from
  `initHome()` and styled in `injectCSS()` under `.bcl-spot`.
- Tests are in `tools/tests/home-spotlight.test.js`. Run them with
  `node --test "tools/tests/*.test.js"`. They cover the Wednesday boundary in
  both Pacific offsets, every fail-closed path, and the seeded file itself
  (Wednesday dates, live slugs, no held slugs, brand copy rules).
- The article image and link come from `/around-town/<slug>?format=json` on the
  live site, which returns the post's own `assetUrl` and `fullUrl`. That is one
  request for the exact post, rather than paging the whole collection: most
  spotlights sit well past the first page of `/around-town?format=json`.
- Clicking the card fires the GA4 event `spotlight_click` with `business`,
  `slug` and `week`. That event is documented in
  `Admin & Brand/analytics-event-dictionary.md`.
- Changing the card's CSS means bumping `CSS_ID` in `bcl-tools.js` and the
  matching assertion in `tools/tests/css-contrast.test.js`.
