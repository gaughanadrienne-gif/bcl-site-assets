"""First-party local employer indexes, discovery only until human review.

No ATS detail is inferred from a title or an employer mailing address. A changed
page structure raises rather than reporting a reassuring zero vacancies.
"""

import re
from html.parser import HTMLParser
from urllib.parse import urlsplit, parse_qs, urlencode


class _Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.parts = []
        self.links = []
        self.link = None
        self.skip = 0
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.skip += 1
        if tag == "a" and not self.skip:
            self.link = [dict(attrs).get("href", ""), [], len(self.parts)]

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.skip = max(0, self.skip - 1)
        if tag == "a" and self.link:
            self.links.append(self.link)
            self.link = None

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.parts.append(data.strip())
            if self.link:
                self.link[1].append(data.strip())


def parse(html, source):
    page = _Page(html)
    text = " ".join(page.parts)
    kind = (source.get("config") or {}).get("local_index")
    if kind == "roaring_camp":
        match = re.search(r"Current Positions Available:\s*(.*?)\s*Employment Office", text, re.I)
        if not match:
            raise ValueError("Roaring Camp current-recruitment section changed; review page")
        if not match.group(1).strip():
            raise ValueError("Roaring Camp recruitment section is empty; verify manually")
        return [{"title": "Roaring Camp recruitment", "employer": "Roaring Camp Railroads",
                 "url": source["url"], "city": "", "description": match.group(1),
                 "review_required": True, "listing_kind": "employer_recruitment"}]
    if kind != "mount_hermon":
        raise ValueError("Unconfigured local employer index")
    starts = [i for i, s in enumerate(page.parts) if s.upper() == "CURRENT OPENINGS"]
    ends = [i for i, s in enumerate(page.parts) if s == "Other Ways to Join Us"]
    if len(starts) != 1 or not ends or ends[0] <= starts[0]:
        raise ValueError("Mount Hermon current-openings boundaries changed; review page")
    rows, seen = [], set()
    for url, title, position in page.links:
        if not starts[0] < position < ends[0]:
            continue
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "www.paycomonline.net":
            raise ValueError("Unexpected application destination in current openings; review source")
        modern = re.fullmatch(r"/v4/ats/web.php/portal/58F6BA3B1C1AA25D186569BA421811AE/jobs/(\d+)", parts.path)
        query = parse_qs(parts.query)
        if modern:
            requisition = modern.group(1)
            canonical = "https://www.paycomonline.net" + parts.path
        elif (parts.path == "/v4/ats/web.php/jobs/ViewJobDetails"
              and query.get("clientkey") == ["58F6BA3B1C1AA25D186569BA421811AE"]
              and len(query.get("job", [])) == 1 and query["job"][0].isdigit()):
            requisition = query["job"][0]
            canonical = "https://www.paycomonline.net" + parts.path + "?" + urlencode({
                "job": requisition, "clientkey": query["clientkey"][0]})
        else:
            raise ValueError("Unrecognized Paycom requisition in current openings; review link format")
        if requisition in seen:
            continue
        seen.add(requisition)
        label = " ".join(title).replace("(opens in a new tab)", "").strip()
        rows.append({"title": label, "employer": "Mount Hermon", "url": canonical,
                     "city": "", "review_required": True,
                     "description": "Current employer index. Verify worksite, pay, schedule and role-specific eligibility before publication."})
    if not rows:
        raise ValueError("No recognized Mount Hermon requisitions; verify before accepting zero")
    return rows
