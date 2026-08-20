"""Build the public article-body feed from the owner-reviewed article register.

The checked-in live-slug manifest mirrors the current Squarespace sitemap.
All 67 live article drafts are emitted; the two drafts absent from the sitemap
are withheld so the browser layer can add ``noindex`` without exposing them.
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
DEFAULT_LIVE_SLUGS = ROOT / "data" / "live-article-slugs.json"
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


def build_feed(
    articles_dir: Path,
    as_of: date,
    live_slugs: set[str] | None = None,
) -> dict:
    register_path = articles_dir / "ARTICLE_REGISTER.csv"
    drafts_dir = articles_dir / "Drafts"
    with register_path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    all_draft_slugs = {path.stem for path in drafts_dir.glob("*.md")}
    row_by_slug = {
        (row.get("slug") or "").strip(): row
        for row in rows
        if (row.get("slug") or "").strip()
    }
    registered_slugs = set(row_by_slug)
    known_slugs = all_draft_slugs | registered_slugs
    public: dict[str, dict] = {}

    for slug in sorted(known_slugs):
        row = row_by_slug.get(slug, {})
        if live_slugs is not None:
            if slug not in live_slugs:
                continue
        elif "live_url" in row:
            if "uploaded hidden" in (row.get("status") or "").lower():
                continue
        elif not is_public_status(row.get("status", ""), as_of):
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


def diff_against_existing(feed: dict, output: Path) -> tuple[list[str], list[str], int]:
    """Compare a freshly built feed against the feed already on disk.

    ``data/articles.json`` is the SOURCE OF TRUTH for live body text; the drafts are
    a mirror of it. A rebuild is therefore only ever expected to be a no-op. Any body
    this build would change, or any live slug it would drop, means a draft has drifted
    and the rebuild would destroy published copy. Returns (changed, dropped, net_chars).
    """
    if not output.exists():
        return [], [], 0
    try:
        current = json.loads(output.read_text(encoding="utf-8")).get("articles", {})
    except (OSError, json.JSONDecodeError):
        return [], [], 0
    built = feed.get("articles", {})
    changed = sorted(
        slug for slug in current
        if slug in built and built[slug].get("html") != current[slug].get("html")
    )
    dropped = sorted(set(current) - set(built))
    net = sum(len(built[s].get("html", "")) - len(current[s].get("html", "")) for s in changed)
    net -= sum(len(current[s].get("html", "")) for s in dropped)
    return changed, dropped, net


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--articles-dir", type=Path, default=DEFAULT_ARTICLES_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--live-slugs", type=Path, default=DEFAULT_LIVE_SLUGS)
    parser.add_argument(
        "--allow-body-changes",
        action="store_true",
        help="write even if the rebuild would change or drop already-published bodies "
             "(default: refuse, because that means a draft has drifted from the feed)",
    )
    args = parser.parse_args()

    live_slugs = set(json.loads(args.live_slugs.read_text(encoding="utf-8")))
    feed = build_feed(args.articles_dir.resolve(), args.as_of, live_slugs)

    changed, dropped, net = diff_against_existing(feed, args.output)
    if (changed or dropped) and not args.allow_body_changes:
        print(f"REFUSING TO WRITE {args.output}")
        print(f"  bodies this rebuild would CHANGE : {len(changed)}")
        print(f"  live slugs it would DROP         : {len(dropped)}")
        print(f"  net characters of live copy      : {net:+d}")
        for slug in (changed + dropped)[:20]:
            print(f"    {slug}")
        if len(changed) + len(dropped) > 20:
            print(f"    ... and {len(changed) + len(dropped) - 20} more")
        print()
        print("data/articles.json is the source of truth; the drafts mirror it, so a")
        print("rebuild is only ever expected to be a no-op. Run")
        print("  python -m scripts.regenerate_drafts        # check, writes nothing")
        print("to see which drafts have drifted, and reconcile them before rebuilding.")
        print("Pass --allow-body-changes only if you intend to overwrite live copy.")
        raise SystemExit(1)

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