"""Build the public article-body feed from the owner-reviewed article register.

Only rows explicitly marked ``published`` or scheduled on/before ``--as-of``
are emitted. All other draft slugs are listed as withheld so the browser layer
can add ``noindex`` without exposing draft copy.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import date
from pathlib import Path

import markdown
import yaml


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTICLES_DIR = ROOT.parents[1] / "Articles"
DEFAULT_OUTPUT = ROOT / "data" / "articles.json"
FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
SCHEDULED = re.compile(r"^scheduled\s+(\d{4}-\d{2}-\d{2})$", re.IGNORECASE)


def split_frontmatter(source: str) -> tuple[dict, str]:
    match = FRONTMATTER.match(source)
    if not match:
        raise ValueError("article is missing YAML frontmatter")
    header = match.group(1)
    try:
        metadata = yaml.safe_load(header) or {}
    except yaml.YAMLError:
        # Several legacy drafts contain an unquoted colon in the title. Keep the
        # publication build tolerant while reading only simple top-level fields.
        metadata = {}
        for line in header.splitlines():
            if not line or line[0].isspace() or ":" not in line:
                continue
            key, value = line.split(":", 1)
            metadata[key.strip()] = value.strip().strip('"').strip("'")
    if not isinstance(metadata, dict):
        raise ValueError("article frontmatter must be a mapping")
    return metadata, source[match.end() :]


def is_public_status(status: str, as_of: date) -> bool:
    normalized = (status or "").strip().lower()
    if normalized == "published":
        return True
    match = SCHEDULED.match(normalized)
    return bool(match and date.fromisoformat(match.group(1)) <= as_of)


def render_body(source: str) -> str:
    """Render trusted owner-authored Markdown and remove editor-only notes."""
    _metadata, body = split_frontmatter(source)
    body = HTML_COMMENT.sub("", body)
    body = body.replace("](/submit)", "](/contact)")
    return markdown.markdown(
        body.strip(),
        extensions=["extra", "sane_lists"],
        output_format="html5",
    )


def build_feed(articles_dir: Path, as_of: date) -> dict:
    register_path = articles_dir / "ARTICLE_REGISTER.csv"
    drafts_dir = articles_dir / "Drafts"
    with register_path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    all_draft_slugs = {path.stem for path in drafts_dir.glob("*.md")}
    public: dict[str, dict] = {}
    registered_slugs: set[str] = set()

    for row in rows:
        slug = (row.get("slug") or "").strip()
        if not slug:
            continue
        registered_slugs.add(slug)
        if not is_public_status(row.get("status", ""), as_of):
            continue

        relative = (row.get("draft_file") or f"Drafts/{slug}.md").strip()
        draft_path = articles_dir / Path(relative)
        if not draft_path.exists():
            raise FileNotFoundError(f"approved article draft not found: {draft_path}")

        source = draft_path.read_text(encoding="utf-8")
        metadata, _body = split_frontmatter(source)
        title = str(metadata.get("title") or row.get("title") or "").strip()
        if not title:
            raise ValueError(f"approved article has no title: {slug}")

        public[slug] = {
            "slug": slug,
            "title": title,
            "html": render_body(source),
            "reviewedAt": str(metadata.get("reviewed_at") or row.get("reviewed_at") or ""),
            "nextReviewAt": str(metadata.get("next_review_at") or row.get("next_review_at") or ""),
        }

    known_slugs = sorted(all_draft_slugs | registered_slugs)
    return {
        "asOf": as_of.isoformat(),
        "articles": dict(sorted(public.items())),
        "withheldSlugs": sorted(set(known_slugs) - set(public)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--articles-dir", type=Path, default=DEFAULT_ARTICLES_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()

    feed = build_feed(args.articles_dir.resolve(), args.as_of)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {len(feed['articles'])} public articles and "
        f"{len(feed['withheldSlugs'])} withheld slugs to {args.output}"
    )


if __name__ == "__main__":
    main()