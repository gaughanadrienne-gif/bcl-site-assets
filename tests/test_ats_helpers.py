from shared.bcl_ingest import parse_relative_date, http_post_json, firecrawl_markdown


def test_relative_date():
    assert parse_relative_date("Posted 5 Days Ago", "2026-07-19") == "2026-07-14"
    assert parse_relative_date("Posted Today", "2026-07-19") == "2026-07-19"
    assert parse_relative_date("Posted 30+ Days Ago", "2026-07-19") == "2026-06-19"
    assert parse_relative_date("garbage", "2026-07-19") == ""

def test_post_json_sends_body_and_parses():
    seen = {}
    class R:
        def read(self): return b'{"total": 2}'
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def fake_opener(req, timeout=None):
        seen["data"] = req.data; seen["ctype"] = req.get_header("Content-type")
        return R()
    out = http_post_json("https://x/jobs", {"limit": 5}, opener=fake_opener)
    assert out == {"total": 2}
    assert b'"limit"' in seen["data"] and seen["ctype"] == "application/json"

def test_firecrawl_wait_passthrough_via_runner():
    assert firecrawl_markdown("https://x", runner=lambda u: "md", wait_ms=5000) == "md"
