"""Invert build_articles.render_body: live article HTML back into Markdown.

WHY THIS EXISTS: on 2026-07-27 the drafts in ``Articles/Drafts/`` were found to be
stale for 94 of 96 articles, because voice rewrites and fact fixes had been applied
directly to ``data/articles.json``. Rebuilding the feed from those drafts would have
deleted roughly 100KB of live copy. This module regenerates the drafts FROM the live
feed so the two agree again.

The HTML being parsed was produced by ``markdown.markdown(extensions=["extra",
"sane_lists"], output_format="html5")``, so the tag vocabulary is small and known.
This is not a general-purpose converter and should not be used as one.

CORRECTNESS IS CHECKED BY ROUND-TRIP, not by inspection: ``regenerate_drafts.py``
re-renders every generated draft and asserts the result is byte-identical to the live
HTML. A draft that does not round-trip is not written.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser

BLOCK = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
         "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr"}
HEADING = {"h1": "#", "h2": "##", "h3": "###", "h4": "####", "h5": "#####", "h6": "######"}
ALIGN = {"text-align: left;": ":---", "text-align: center;": ":---:",
         "text-align: right;": "---:"}


def _esc(text: str) -> str:
    """Escape only what would otherwise be re-parsed as markup on the way back."""
    return text.replace("*", r"\*").replace("_", r"\_").replace("`", r"\`")


class _Converter(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.buf: list[str] = []
        self.list_stack: list[dict] = []
        self.list_lines: list[str] = []
        self.in_quote = False
        self.table: list | None = None
        self.row: list[str] | None = None
        self.aligns: list[str] = []
        self.in_head = False
        self.cell: list[str] | None = None

    # -- helpers -------------------------------------------------------
    def _emit(self, text: str) -> None:
        self.out.append(text)

    def _sink(self) -> list[str]:
        return self.cell if self.cell is not None else self.buf

    def _flush(self, prefix: str = "") -> str:
        text = "".join(self.buf).strip()
        self.buf = []
        return prefix + text if text else ""

    # -- tags ----------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a":
            self._sink().append("[")
        elif tag == "strong":
            self._sink().append("**")
        elif tag == "em":
            self._sink().append("*")
        elif tag == "br":
            self._sink().append("  \n")
        elif tag == "hr":
            self._emit("---")
        elif tag in ("ul", "ol"):
            self.list_stack.append({"ordered": tag == "ol", "n": 0})
        elif tag == "li":
            if self.list_stack:
                self.list_stack[-1]["n"] += 1
        elif tag == "blockquote":
            self.in_quote = True
        elif tag == "table":
            self.table, self.aligns = [], []
        elif tag == "thead":
            self.in_head = True
        elif tag == "tr":
            self.row = []
        elif tag in ("th", "td"):
            self.cell = []
            if self.in_head:
                self.aligns.append(ALIGN.get((a.get("style") or "").strip(), "---"))
        elif tag == "a":
            pass
        self._href = a.get("href") if tag == "a" else getattr(self, "_href", None)

    def handle_endtag(self, tag):
        if tag == "a":
            self._sink().append("](%s)" % (self._href or ""))
        elif tag == "strong":
            self._sink().append("**")
        elif tag == "em":
            self._sink().append("*")
        elif tag == "p":
            if self.list_stack or self.cell is not None:
                return
            text = self._flush()
            if text:
                self._emit("> " + text if self.in_quote else text)
        elif tag in HEADING:
            text = self._flush()
            if text:
                self._emit("%s %s" % (HEADING[tag], text))
        elif tag == "li":
            item = self.list_stack[-1] if self.list_stack else {"ordered": False, "n": 1}
            marker = ("%d." % item["n"]) if item["ordered"] else "-"
            text = self._flush()
            indent = "    " * (len(self.list_stack) - 1)
            if text:
                # Items accumulate in the list buffer and are emitted as ONE block
                # when the outermost list closes. Emitting them individually would
                # put a blank line between items, which makes the list "loose" and
                # markdown then wraps every item in <p>.
                self.list_lines.append("%s%s %s" % (indent, marker, text))
        elif tag in ("ul", "ol"):
            if self.list_stack:
                self.list_stack.pop()
            if not self.list_stack and self.list_lines:
                self._emit("\n".join(self.list_lines))
                self.list_lines = []
        elif tag == "blockquote":
            self.in_quote = False
        elif tag in ("th", "td"):
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr":
            self.table.append((self.in_head, self.row))
            self.row = None
        elif tag == "thead":
            self.in_head = False
        elif tag == "table":
            self._emit(self._render_table())
            self.table = None

    def handle_data(self, data):
        target = self._sink()
        if self.table is not None and self.cell is None:
            return
        if not target and not data.strip():
            return
        target.append(_esc(data))

    # -- table ---------------------------------------------------------
    def _render_table(self) -> str:
        head = [r for h, r in self.table if h]
        body = [r for h, r in self.table if not h]
        lines = []
        if head:
            lines.append("| " + " | ".join(head[0]) + " |")
            lines.append("|" + "|".join(self.aligns) + "|")
        for row in body:
            lines.append("| " + " | ".join(row) + " |")
        return "\n".join(lines)


def _markdown_only(html: str) -> str:
    """Convert HTML to Markdown assuming every construct in it is expressible.

    This is the original converter. It silently drops anything Markdown has no syntax
    for: element attributes (``class``, ``target``, ``rel``) and whole tags it does not
    know (``figure``, ``div``, inline ``svg``). Callers should use ``html_to_markdown``,
    which falls back to raw HTML wherever this loses information.
    """
    conv = _Converter()
    conv.feed(html)
    blocks = [b for b in conv.out if b != ""]
    text = "\n\n".join(blocks)
    # collapse the blank line markdown inserts between a list and its lead-in
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def _render(md: str) -> str:
    """Exactly build_articles.render_body's markdown call, for self-verification."""
    import markdown  # local import: only the hybrid path needs it
    return markdown.markdown(
        md.strip(), extensions=["extra", "sane_lists"], output_format="html5"
    )


_TAG = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\"[^\"]*\"|'[^']*'|[^>])*?)(/?)>", re.S)
_VOID = {"br", "hr", "img", "input", "meta", "link", "source", "col", "area", "base",
         "embed", "param", "track", "wbr"}


def _segments(html: str) -> list[str]:
    """Split into top-level blocks, cutting ONLY at depth-0 single newlines.

    Markdown separates top-level blocks with exactly one newline, so those are the only
    safe cut points. Anything glued with no newline, or split by a blank line, stays in
    one segment. The invariant ``"\\n".join(_segments(h)) == h`` holds exactly.
    """
    depth = 0
    cuts = []
    for m in _TAG.finditer(html):
        closing, name, _attrs, self_closing = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if closing:
            depth -= 1
        elif self_closing or name in _VOID:
            pass
        else:
            depth += 1
        if depth == 0:
            end = m.end()
            if html[end:end + 1] == "\n" and html[end + 1:end + 2] != "\n":
                cuts.append(end)
    out = []
    prev = 0
    for cut in cuts:
        out.append(html[prev:cut])
        prev = cut + 1
    out.append(html[prev:])
    return out


def html_to_markdown(html: str) -> str:
    """Convert one article's rendered HTML back to the Markdown that produced it.

    Block by block, this converts to Markdown and re-renders. If the re-render is
    byte-identical the Markdown is kept; otherwise the original HTML is emitted
    verbatim, because Markdown's ``extra`` extension passes raw HTML through unchanged.
    That is what carries ``class="bcl-printable"``, ``target="_blank" rel="noopener"``
    and inline ``<figure>``/``<svg>`` blocks, none of which Markdown can express.

    Verifying per block rather than per document means one un-representable paragraph
    costs one paragraph of raw HTML, not a whole article.

    Round-trip coverage on the 172-article corpus went from 112 to 134 with this change.
    The remaining 38 are not a converter limitation: their stored HTML contains adjacent
    block tags with no newline between them (``</p><p>``, 67 occurrences corpus-wide) or
    a stray trailing newline, and ``markdown`` cannot emit either. Normalising those in
    the feed is a cosmetic edit that changes no rendered text and takes the corpus to
    172 of 172; it is a feed change, so it is held for owner approval.
    """
    pieces: list[str] = []
    previous_was_raw = False
    for segment in _segments(html):
        candidate = _markdown_only(segment)
        expressible = bool(candidate.strip()) and _render(candidate) == segment
        if pieces:
            # A raw HTML block already terminates markdown's block, so a single newline
            # after one renders as a single newline. Everywhere else markdown needs the
            # blank line to keep the blocks apart.
            pieces.append("\n" if previous_was_raw else "\n\n")
        pieces.append(candidate.strip() if expressible else segment)
        previous_was_raw = not expressible
    return "".join(pieces).strip() + "\n"
