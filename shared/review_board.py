"""Generate a self-contained browser page for the owner to approve/reject queued
listings (the same tap-to-pick pattern used for the directory logo confirmations).
Approvals are collected client-side and copied out as a list of ids to merge into
partials/manual-*.json. No network, no framework, one file."""

import html as _html
import re


def _display(value):
    """Collapse whitespace for display WITHOUT stripping tags (that's the caller's
    job via html.escape below) so raw markup is escaped, not silently dropped."""
    return re.sub(r"\s+", " ", str(value or "")).strip()

_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boulder Creek Local - review {tool}</title>
<style>
 body{{font-family:Inter,Arial,sans-serif;color:#1c2a26;background:#f5f1e7;margin:0;padding:18px;}}
 h1{{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36;font-size:1.5rem;}}
 .card{{background:#fffdf8;border:1px solid #e3ddcf;padding:14px 16px;margin:0 0 12px;border-radius:4px;}}
 .card.approved{{border-color:#2f6754;box-shadow:inset 0 0 0 2px #2f6754;}}
 .card.rejected{{opacity:.5;}}
 .title{{font-weight:600;color:#173f36;font-size:1.05rem;}}
 .sub{{font-size:.82rem;color:#2f6754;margin:2px 0 6px;}}
 .detail{{font-size:.9rem;color:#1c2a26;margin:0 0 8px;}}
 a{{color:#2e6b46;}}
 button{{font:inherit;padding:8px 14px;margin:4px 6px 0 0;border:1px solid #cfc9b8;background:#fffdf8;cursor:pointer;border-radius:3px;}}
 .bar{{position:sticky;top:0;background:#f5f1e7;padding:10px 0;}}
 #out{{width:100%;min-height:64px;margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:.8rem;}}
</style></head><body>
<h1>Review queued {tool}</h1>
<div class="bar"><button onclick="copyApproved()">Copy approved</button>
<span id="tally"></span></div>
{cards}
<textarea id="out" placeholder="Approved ids appear here after you tap Copy approved"></textarea>
<script>
 var KEY="bcl-review-{tool}";
 var state=JSON.parse(localStorage.getItem(KEY)||"{{}}");
 function set(id,v){{state[id]=v;localStorage.setItem(KEY,JSON.stringify(state));paint();}}
 function paint(){{
   var a=0;
   document.querySelectorAll(".card").forEach(function(c){{
     var id=c.getAttribute("data-id"),s=state[id];
     c.classList.toggle("approved",s==="approve");
     c.classList.toggle("rejected",s==="reject");
     if(s==="approve")a++;
   }});
   document.getElementById("tally").textContent=a+" approved";
 }}
 function copyApproved(){{
   var ids=Object.keys(state).filter(function(k){{return state[k]==="approve";}});
   document.getElementById("out").value=ids.join("\\n");
 }}
 paint();
</script>
</body></html>"""

_CARD = """<div class="card" data-id="{id}">
<div class="title">{title}</div><div class="sub">{subtitle}</div>
{detail}{link}
<button onclick="set('{id}','approve')">Approve</button>
<button onclick="set('{id}','reject')">Reject</button></div>"""


def render_review_board(items, tool, out_path):
    cards = []
    for item in items:
        item_id = _html.escape(str(item.get("id", "")))
        detail = item.get("detail")
        url = item.get("url")
        cards.append(_CARD.format(
            id=item_id,
            title=_html.escape(_display(item.get("title"))),
            subtitle=_html.escape(_display(item.get("subtitle"))),
            detail='<div class="detail">%s</div>' % _html.escape(_display(detail)) if detail else "",
            link='<div><a href="%s" target="_blank" rel="noopener">View source</a></div>' % _html.escape(str(url)) if url else "",
        ))
    page = _PAGE.format(tool=_html.escape(str(tool)), cards="\n".join(cards))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(page)
    return page
