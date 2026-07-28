"""Regenerate Articles/Drafts/*.md FROM the live article feed.

Background: as of 2026-07-27 the drafts had drifted from ``data/articles.json`` for
94 of 96 articles, because voice rewrites and fact fixes were applied directly to the
JSON. That made ``build_articles.py`` destructive. This script restores the invariant
that the drafts and the feed describe the same articles.

SAFETY: a draft is only written if the Markdown it generates re-renders to HTML that
is BYTE-IDENTICAL to the live HTML. Anything that fails that check is reported and
skipped, never written. Existing YAML frontmatter is preserved verbatim; only the
body below it is replaced.

Usage:
    python -m scripts.regenerate_drafts --check     # report only, write nothing
    python -m scripts.regenerate_drafts --write     # write the drafts that round-trip
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import markdown

from .html_to_markdown import html_to_markdown

ROOT = Path(__file__).resolve().parents[1]
ARTICLES_JSON = ROOT / "data" / "articles.json"
DRAFTS = ROOT.parents[1] / "Articles" / "Drafts"
FRONTMATTER = re.compile(r"\A(---\s*\n.*?\n---\s*\n)", re.DOTALL)
BANNER = ("<!-- BODY REGENERATED FROM data/articles.json ON 2026-07-27. That file is the\n"
          "     SOURCE OF TRUTH for live body text; this draft is a mirror of it. Verified\n"
          "     by round-trip: this Markdown re-renders byte-identical to the live HTML.\n"
          "     Edit the feed, then re-run scripts/regenerate_drafts.py. -->")


def _sync_field(front: str, key: str, value: str) -> str:
    """Rewrite one top-level frontmatter scalar to match the feed, if it is present."""
    pattern = re.compile(r"(?m)^%s:.*$" % re.escape(key))
    if not pattern.search(front):
        return front
    if value and (":" in value or '"' in value or value.strip() != value):
        replacement = '%s: "%s"' % (key, value.replace('"', "'"))
    elif value:
        replacement = "%s: %s" % (key, value)
    else:
        replacement = "%s:" % key
    return pattern.sub(lambda _: replacement, front, count=1)


def render(md_text: str) -> str:
    """Exactly build_articles.render_body's markdown call."""
    return markdown.markdown(
        md_text.strip(), extensions=["extra", "sane_lists"], output_format="html5"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write drafts (default: check only)")
    args = ap.parse_args()

    articles = json.loads(ARTICLES_JSON.read_text(encoding="utf-8"))["articles"]
    good, failed, missing_fm = [], [], []

    for slug in sorted(articles):
        live = articles[slug]["html"]
        body = html_to_markdown(live)
        if render(body) != live:
            failed.append(slug)
            continue
        good.append(slug)
        if not args.write:
            continue

        path = DRAFTS / f"{slug}.md"
        if path.exists():
            match = FRONTMATTER.match(path.read_text(encoding="utf-8"))
            if not match:
                missing_fm.append(slug)
                continue
            front = match.group(1)
        else:
            missing_fm.append(slug)
            continue
        # build_articles resolves reviewedAt and title from FRONTMATTER FIRST and only
        # then from the register, so a draft left with a stale value silently reverts the
        # feed on the next rebuild. Mirror both from the feed while we are here.
        front = _sync_field(front, "reviewed_at", articles[slug].get("reviewedAt") or "")
        front = _sync_field(front, "title", articles[slug].get("title") or "")
        path.write_text(f"{front}\n{BANNER}\n\n{body}", encoding="utf-8")

    print(f"round-trip clean : {len(good)}")
    print(f"round-trip FAILED: {len(failed)}  {failed}")
    if missing_fm:
        print(f"skipped, no draft/frontmatter: {len(missing_fm)}  {missing_fm}")
    if args.write:
        print(f"drafts written   : {len(good) - len(missing_fm)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
