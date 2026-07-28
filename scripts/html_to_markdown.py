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


def html_to_markdown(html: str) -> str:
    """Convert one article's rendered HTML back to the Markdown that produced it."""
    conv = _Converter()
    conv.feed(html)
    blocks = [b for b in conv.out if b != ""]
    text = "\n\n".join(blocks)
    # collapse the blank line markdown inserts between a list and its lead-in
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"
