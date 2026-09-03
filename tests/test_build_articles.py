from datetime import date
from pathlib import Path

from scripts.build_articles import apply_image_alts, build_feed, is_public_status, load_image_alts, render_body


def test_public_status_is_explicit_and_date_bounded():
    as_of = date(2026, 7, 20)
    assert is_public_status("published", as_of)
    assert is_public_status("scheduled 2026-07-20", as_of)
    assert not is_public_status("scheduled 2026-07-21", as_of)
    assert not is_public_status("draft", as_of)
    assert not is_public_status("draft (uploaded hidden)", as_of)


def test_render_body_removes_editor_notes_and_repairs_contact_route():
    source = """---
title: Test
slug: test
---
Intro.

<!-- REFRESH NOTE: private -->

## Heading

[Send it to us](/submit).
"""
    html = render_body(source)
    assert "REFRESH NOTE" not in html
    assert '<h2>Heading</h2>' in html
    assert 'href="/contact"' in html
    assert "/submit" not in html


def test_split_frontmatter_tolerates_legacy_unquoted_title_colons():
    html = render_body("---\ntitle: Fires, Floods, and Storms: A History\nslug: history\n---\nBody.\n")
    assert html == "<p>Body.</p>"

def test_build_feed_emits_only_approved_rows(tmp_path: Path):
    articles = tmp_path / "Articles"
    drafts = articles / "Drafts"
    drafts.mkdir(parents=True)
    (articles / "ARTICLE_REGISTER.csv").write_text(
        "title,slug,status,draft_file,reviewed_at\n"
        "Public,public,published,Drafts/public.md,2026-07-01\n"
        "Future,future,scheduled 2026-07-21,Drafts/future.md,\n"
        "Draft,draft,draft,Drafts/draft.md,\n",
        encoding="utf-8",
    )
    for slug in ("public", "future", "draft"):
        (drafts / f"{slug}.md").write_text(
            f"---\ntitle: {slug.title()}\nslug: {slug}\n---\n\nBody for {slug}.\n",
            encoding="utf-8",
        )

    feed = build_feed(articles, date(2026, 7, 20))
    assert list(feed["articles"]) == ["public"]
    assert feed["articles"]["public"]["html"] == "<p>Body for public.</p>"
    assert feed["withheldSlugs"] == ["draft", "future"]


def test_build_feed_adds_reviewed_scene_alt_text(tmp_path: Path):
    articles = tmp_path / "Articles"
    drafts = articles / "Drafts"
    drafts.mkdir(parents=True)
    (articles / "ARTICLE_REGISTER.csv").write_text(
        "title,slug,status,draft_file,reviewed_at\n"
        "Public,public,published,Drafts/public.md,2026-07-01\n",
        encoding="utf-8",
    )
    (drafts / "public.md").write_text(
        "---\ntitle: Public\nslug: public\n---\n\nBody.\n",
        encoding="utf-8",
    )

    feed = build_feed(
        articles,
        date(2026, 7, 20),
        image_alts={"public": "A watercolor scene of a redwood-lined road."},
    )
    assert feed["articles"]["public"]["imageAlt"] == "A watercolor scene of a redwood-lined road."


def test_load_image_alts_rejects_duplicate_slugs(tmp_path: Path):
    csv_path = tmp_path / "image_seo.csv"
    csv_path.write_text(
        "slug,alt_text\n"
        "same,First description.\n"
        "same,Second description.\n",
        encoding="utf-8",
    )

    try:
        load_image_alts(csv_path)
    except ValueError as exc:
        assert "duplicate image metadata slug: same" in str(exc)
    else:
        raise AssertionError("duplicate image metadata should fail")


def test_apply_image_alts_preserves_article_body_and_exceptional_header_by_default():
    feed = {
        "articles": {
            "one": {
                "html": "<p>Keep me byte-for-byte.</p>",
                "reviewedAt": "2026-09-03",
                "headerImage": "brand/article-headers/legacy.webp",
            },
        }
    }
    count, cleared = apply_image_alts(feed, {"one": "A watercolor of a redwood trail."})

    assert count == 1
    assert cleared == 0
    assert feed["articles"]["one"] == {
        "html": "<p>Keep me byte-for-byte.</p>",
        "reviewedAt": "2026-09-03",
        "headerImage": "brand/article-headers/legacy.webp",
        "imageAlt": "A watercolor of a redwood trail.",
    }


def test_apply_image_alts_clears_only_an_explicit_legacy_override():
    feed = {
        "articles": {
            "one": {"headerImage": "brand/article-headers/legacy.webp"},
            "two": {"headerImage": "brand/article-headers/keep.webp"},
        }
    }
    alts = {"one": "A watercolor trail.", "two": "A watercolor storefront."}

    count, cleared = apply_image_alts(feed, alts, {"one"})

    assert count == 2
    assert cleared == 1
    assert "headerImage" not in feed["articles"]["one"]
    assert feed["articles"]["two"]["headerImage"] == "brand/article-headers/keep.webp"
