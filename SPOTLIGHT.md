# The homepage business spotlight

One business at a time, on the homepage, directly under the local board and
above the rain card. It shows the business name, the article's own header image,
a short blurb, and a link through to the spotlight article.

Which business shows, and when, comes from one file: **`data/spotlight.json`**.

## Where the running order actually comes from

**The source of truth is the social schedule**, not this file:

    Social Media/Blotato_2026_H2/MASTER_SCHEDULE.csv

Every `BCL-SPOT` post in there is a Thursday, and `data/spotlight.json` mirrors
it so the homepage always matches whatever you just posted. **If the two ever
disagree, the social schedule is right and this file is stale.** There is a test
that fails if they drift apart, so you will hear about it.

If you add a spotlight post to the social schedule, add the matching row here at
the same time.

## When it changes over

**Every Thursday at midnight, Boulder Creek time**, the same day the post goes
out. A business holds the card until the next scheduled Thursday.

It changes at midnight *here*, not midnight wherever the reader happens to be.
Someone opening the site from London or Tokyo sees the business you are actually
posting about.

**Gaps are fine.** If there is no spotlight on a given Thursday, the current
business simply stays up until the next one. That is the real behaviour you
wanted: the spotlight on social is still that business, so the homepage should
still say so. Your 2026 order has four such gaps (29 Oct, 12 Nov, 26 Nov, 3 Dec)
and they need nothing done to them.

## Adding the next business

Open `data/spotlight.json` and add a block to the `schedule` list. Copy an
existing one and change the four values:

```json
{
  "week": "2026-11-05",
  "slug": "tree-house-cafe-boulder-creek",
  "business": "Tree House Cafe",
  "blurb": "Living redwoods grow up through the floor and out through the roof, and the seating was built to fit around them."
}
```

- **`week`** is the **Thursday** the business takes over, written `YYYY-MM-DD`.
  Use a Thursday. If you type another day it still works, but it starts on the
  Thursday *before* the date you typed, which is probably not what you meant.
- **`slug`** is the bit of the article URL after `/around-town/`. It has to be a
  published article. If it is not, the card quietly disappears rather than
  showing a broken link.
- **`business`** is the name as you want it read on the card.
- **`blurb`** is the hook. Two sentences, roughly 60 to 260 characters. Pull a
  specific detail out of the article rather than describing the shop in general.
  "Twenty-five people sent $1,875" makes someone click. "A beloved local
  business" does not.

House rules apply to the blurb: no em-dashes, no emojis, no AI-tell phrasing.
The tests check all of that.

## If you forget

Nothing breaks. The current business keeps showing.

**After 28 days with nothing newer, the card removes itself from the homepage.**
That is on purpose: the kicker says "This week's business spotlight", and after a
month that stops being merely out of date and starts being untrue. The homepage
just closes up around it and nothing else changes.

## When it shows nothing at all

By design, in every one of these cases, rather than showing something broken:

- the running order is missing, unreadable, or the wrong shape
- nothing has been scheduled yet, or the last entry is over 28 days old
- the slug does not match a live article
- the article has no header image of its own

The card is meant to be absent rather than wrong. An empty band on the homepage
is worse for a reader than no band.

## Notes on the design

- The card's kicker uses a slightly darkened clay (`#b35230`) rather than the
  brand clay `#d56e47`. Brand clay measures 3.36:1 against the card background,
  which fails accessibility guidelines for text that small and was part of why
  the card was hard to read. The darkened version is 4.96:1 and still reads as
  clay. Full clay is still used on the keyboard focus ring. Say the word if you
  would rather have the exact brand hue back and accept the legibility cost.
- The blurb was made larger and slightly heavier on 2026-09-09 for the same
  reason.
- The card's position is fixed before its data loads, so it cannot end up in the
  wrong place depending on which request finishes first.
