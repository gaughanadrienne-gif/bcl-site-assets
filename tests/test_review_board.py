from shared.review_board import render_review_board


ITEMS = [
    {"id": "job-1", "title": "Line Cook", "subtitle": "New Leaf, Santa Cruz", "url": "https://x/1"},
    {"id": "rent-2", "title": "2BR Cottage", "subtitle": "Boulder Creek 95006"},
]


def test_render_writes_file_and_returns_html(tmp_path):
    out = str(tmp_path / "review.html")
    html = render_review_board(ITEMS, tool="jobs", out_path=out)
    assert html.startswith("<!doctype html>")
    on_disk = open(out, encoding="utf-8").read()
    assert on_disk == html

def test_render_includes_every_item_id_and_title():
    html = render_review_board(ITEMS, tool="jobs", out_path=None)
    assert "job-1" in html and "rent-2" in html
    assert "Line Cook" in html and "2BR Cottage" in html

def test_render_escapes_html_in_fields():
    html = render_review_board(
        [{"id": "x", "title": "<script>alert(1)</script>", "subtitle": "s"}],
        tool="jobs", out_path=None,
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html

def test_render_has_approve_and_copy_controls():
    html = render_review_board(ITEMS, tool="jobs", out_path=None)
    assert "Copy approved" in html
    assert "localStorage" in html
