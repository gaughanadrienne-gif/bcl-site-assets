"""Derive data/articles-meta.json from data/articles.json.

Article pages are served natively by Squarespace, so tools/bcl-tools.js only
needs each article's metadata on a normal view: title, checked date and reading
image. Fetching the whole feed for that cost every cold article view the bodies
of all 174 articles (about 1.8 MB decoded). This file carries only the fields
initArticleContent reads, plus withheldSlugs.

articles.json stays the single source of truth. This output is DERIVED: never
edit it by hand. Regenerate after any feed change:

    python -m scripts.build_article_meta          # write
    python -m scripts.build_article_meta --check  # exit 1 if stale

The GitHub workflow .github/workflows/article-meta.yml runs it on every push
that touches data/articles.json, and tools/tests/article-meta.test.js fails
when the two files disagree. If the metadata is ever behind, the page code
falls back to the full feed for any slug it does not find here.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / "data" / "articles.json"
OUT = ROOT / "data" / "articles-meta.json"
FIELDS = ("title", "reviewedAt", "headerImage", "imageAlt")


def derive(feed):
    articles = {}
    for slug in sorted(feed.get("articles", {})):
        record = feed["articles"][slug]
        articles[slug] = {k: record[k] for k in FIELDS if record.get(k)}
    return {
        "asOf": feed.get("asOf", ""),
        "withheldSlugs": list(feed.get("withheldSlugs", [])),
        "articles": articles,
    }


def render(meta):
    return json.dumps(meta, ensure_ascii=False, indent=1) + "\n"


def main():
    feed = json.loads(FEED.read_text(encoding="utf-8"))
    text = render(derive(feed))
    current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    if "--check" in sys.argv:
        if current != text:
            print("articles-meta.json is stale; run python -m scripts.build_article_meta")
            return 1
        print("articles-meta.json is current")
        return 0
    if current != text:
        OUT.write_text(text, encoding="utf-8", newline="\n")
        print("wrote %s (%d articles, %d bytes)" % (OUT.name, len(json.loads(text)["articles"]), len(text.encode("utf-8"))))
    else:
        print("articles-meta.json already current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
