#!/usr/bin/env python3
"""Build clean, text-free article reading headers from BCL watercolor sources.

This deliberately does not touch ``data/articles.json`` or any Squarespace
record.  It prepares the public assets that a later, separately reviewed data
change can reference.

Treatment
---------
All outputs use a 1200 x 630 canvas, matching the site's existing OG card
geometry so a later header swap does not change its layout reservation.  The
existing title-card system already establishes a centred ``cover`` treatment,
so reading headers use the same composition rule, with no subject detection or
per-image guessed focal point.  The original SuperNatural header is left in
``brand/article-headers`` untouched as a rollback asset; this creates its new,
cache-clean derivative alongside the rest of the rollout.

The builder renders each result in memory and only writes it when its bytes
differ from the existing file, so normal reruns are deterministic and
idempotent.  ``--check`` verifies the same expected byte stream without
changing the working tree.

Usage from this repository:

    python scripts/build_reading_headers.py
    python scripts/build_reading_headers.py --check
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps, features


HERE = Path(__file__).resolve()
REPO = HERE.parents[1]
BCL_ROOT = REPO.parents[1]
SOURCE_DIR = BCL_ROOT / "Media Library" / "Article Images"
OUTPUT_DIR = REPO / "brand" / "article-reading-headers"
LIVE_SLUGS_PATH = REPO / "data" / "live-article-slugs.json"
ARTICLES_PATH = REPO / "data" / "articles.json"

CANVAS = (1200, 630)
PAPER = (255, 253, 248)
WEBP_OPTIONS = {"format": "WEBP", "quality": 86, "method": 6}
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_active_slugs() -> list[str]:
    """Return the approved, public body-slug allowlist and guard data drift."""
    slugs = json.loads(LIVE_SLUGS_PATH.read_text(encoding="utf-8"))
    if not isinstance(slugs, list) or not all(isinstance(slug, str) for slug in slugs):
        raise ValueError(f"{LIVE_SLUGS_PATH} must be a JSON list of slug strings")
    if len(slugs) != len(set(slugs)):
        raise ValueError(f"{LIVE_SLUGS_PATH} contains duplicate slugs")

    article_keys = set(json.loads(ARTICLES_PATH.read_text(encoding="utf-8"))["articles"])
    if set(slugs) != article_keys:
        missing = sorted(set(slugs) - article_keys)
        extra = sorted(article_keys - set(slugs))
        raise ValueError(
            "Active slug allowlist and articles.json keys differ "
            f"(missing records: {missing}; non-live records: {extra})"
        )
    return sorted(slugs)


def source_to_rgb(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        # Flattening avoids unpredictable WebP alpha rendering on a cream page.
        if opened.mode in ("RGBA", "LA") or (opened.mode == "P" and "transparency" in opened.info):
            rgba = opened.convert("RGBA")
            base = Image.new("RGB", rgba.size, PAPER)
            base.paste(rgba, mask=rgba.getchannel("A"))
            return base
        return opened.convert("RGB")


def render_header(source: Image.Image) -> Image.Image:
    """Render a source painting onto the standard reading-header canvas.

    This is the same centred cover crop already used for BCL's canonical title
    cards.  There is intentionally no face/subject detection or per-image
    guessed focal point: the approved watercolor is the source of composition
    truth.  ``crop_metrics`` surfaces outlier source ratios for visual review.
    """
    return ImageOps.fit(source, CANVAS, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def crop_metrics(source_size: tuple[int, int]) -> tuple[float, float]:
    """Return the proportion cropped from width and height by centred cover."""
    source_width, source_height = source_size
    scale = max(CANVAS[0] / source_width, CANVAS[1] / source_height)
    visible_width = CANVAS[0] / scale
    visible_height = CANVAS[1] / scale
    return (1 - visible_width / source_width, 1 - visible_height / source_height)


def encode_webp(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, **WEBP_OPTIONS)
    return buffer.getvalue()


def inspect_output(path: Path) -> tuple[tuple[int, int], str]:
    with Image.open(path) as image:
        return image.size, image.format


def build_one(slug: str) -> bytes:
    source_path = SOURCE_DIR / f"{slug}.png"
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing source watercolor: {source_path}")
    return encode_webp(render_header(source_to_rgb(source_path)))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify expected output without writing")
    parser.add_argument(
        "--slug",
        action="append",
        default=[],
        help="build or check one slug with a completed source watercolor (repeatable)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not features.check("webp"):
        raise RuntimeError("Pillow was built without WebP support")

    all_slugs = load_active_slugs()
    # Explicit slugs may be prepared before their Squarespace shell enters the
    # live allowlist. A full build remains locked to the current active set.
    selected = sorted(set(args.slug)) if args.slug else all_slugs
    invalid_slugs = [slug for slug in selected if not SLUG.fullmatch(slug)]
    if invalid_slugs:
        raise ValueError(f"Invalid slug(s): {', '.join(invalid_slugs)}")
    missing_sources = [slug for slug in selected if not (SOURCE_DIR / f"{slug}.png").is_file()]
    if missing_sources:
        raise FileNotFoundError(
            "Missing source watercolor(s): " + ", ".join(missing_sources)
        )

    if not args.check:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    created = updated = unchanged = invalid = 0
    expected_bytes = 0
    review = []
    for slug in selected:
        source_path = SOURCE_DIR / f"{slug}.png"
        with Image.open(source_path) as source:
            source_size = source.size
        crop_width, crop_height = crop_metrics(source_size)
        # The common 1200x896 watercolor is a known 29.7% top/bottom crop. Flag
        # only genuine outliers that lose more than 35% in either direction.
        if max(crop_width, crop_height) > 0.35:
            review.append((slug, source_size, crop_width, crop_height))

        expected = build_one(slug)
        expected_bytes += len(expected)
        destination = OUTPUT_DIR / f"{slug}.webp"
        current = destination.read_bytes() if destination.is_file() else None
        if current == expected:
            unchanged += 1
            continue
        if args.check:
            invalid += 1
            print(f"OUTDATED {destination.relative_to(REPO)}")
            continue
        destination.write_bytes(expected)
        if current is None:
            created += 1
            action = "CREATED"
        else:
            updated += 1
            action = "UPDATED"
        print(f"{action} {destination.relative_to(REPO)}")

    # Confirm written/existing files are actual standard WebPs. This is kept
    # separate from byte checks so a corrupt output gets a direct diagnostic.
    for slug in selected:
        destination = OUTPUT_DIR / f"{slug}.webp"
        if not destination.is_file():
            continue
        size, fmt = inspect_output(destination)
        if size != CANVAS or fmt != "WEBP":
            invalid += 1
            print(f"INVALID {destination.relative_to(REPO)}: {fmt} {size[0]}x{size[1]}")

    mode = "CHECK" if args.check else "BUILD"
    print(
        f"{mode} complete: {len(selected)} selected, {created} created, {updated} updated, "
        f"{unchanged} unchanged, {invalid} invalid/outdated, expected payload {expected_bytes:,} bytes."
    )
    if review:
        print("Manual composition review (more than 35% cropped in one dimension):")
        for slug, size, crop_width, crop_height in review:
            print(
                f"  {slug}: source {size[0]}x{size[1]}, "
                f"crop {crop_width:.1%} width / {crop_height:.1%} height"
            )
    return 1 if invalid else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)
