def test_package_imports():
    import shared.bcl_ingest  # noqa: F401


from shared.bcl_ingest import sanitize_text, make_slug, normalize_url


def test_sanitize_strips_tags_and_collapses_space():
    assert sanitize_text("<p>Hello   &amp;  world</p>\n") == "Hello & world"

def test_sanitize_handles_none():
    assert sanitize_text(None) == ""

def test_make_slug_basic():
    assert make_slug("Line Cook", "New Leaf Market") == "line-cook-new-leaf-market"

def test_make_slug_empty_fallback():
    assert make_slug("", None) == "item"

def test_normalize_url_drops_query_keeps_fragment():
    assert normalize_url("https://x.com/jobs/?utm=1#/jobs/9") == "https://x.com/jobs#/jobs/9"

def test_normalize_url_equal_after_tracking_strip():
    a = normalize_url("https://x.com/j/5?src=fb")
    b = normalize_url("https://x.com/j/5?ref=tw")
    assert a == b
