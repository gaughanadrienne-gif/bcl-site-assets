# Local preview harness

These pages let you view and screenshot the widgets in `tools/bcl-tools.js` against
the local working tree, without deploying to jsDelivr/GitHub Pages first.

## Run it

From the repo root:

```
python -m http.server 8080
```

Then open:

- `http://localhost:8080/preview/jobs-preview.html`
- `http://localhost:8080/preview/rentals-preview.html`

Each page sets `window.BCL_REPO = ".."` before loading `tools/bcl-tools.js`, so the
script's `REPO` constant resolves to the repo root (served by the http.server) instead
of the production jsDelivr CDN. This means the pages read whatever is currently in
`data/jobs.json` and `data/rentals.json` on disk.

## Requirements

Both pages need real local data files, produced by the refresh scripts:

```
python jobs/refresh_jobs.py
python rentals/refresh_rentals.py
```

These write `data/jobs.json` and `data/rentals.json`. Neither file is committed to
git (see `.gitignore` / plan notes) — refresh them locally whenever you want to
preview current data.

## What this is for

- Visual/manual QA of the Local/Remote job tabs, filters, and cards.
- Visual/manual QA of the rentals board (verified-only default, beds filter, badge).
- A stable target for headless screenshots (e.g. Playwright) when documenting a
  change for review.

This harness is dev-only. Production embedding uses the snippets in
`docs/embeds/jobs-embed.html` and `docs/embeds/rentals-embed.html`, which point at
the published jsDelivr URL and do not set `window.BCL_REPO`.
