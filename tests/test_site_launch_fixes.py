import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / "docs" / "embeds" / "contact-and-submit-form.html"
HEADER = ROOT / "squarespace" / "01_HEADER_INJECTION.html"


def _opening_tag(source: str, element_id: str) -> str:
    match = re.search(
        rf"""<(?:input|select|textarea|div)\b[^>]*\bid=["']{re.escape(element_id)}["'][^>]*>""",
        source,
        re.IGNORECASE,
    )
    assert match, f"Missing element #{element_id}"
    return match.group(0)


def test_submission_form_labels_reference_real_controls():
    markup = FORM.read_text(encoding="utf-8").split("<script>", 1)[0]
    label_tags = re.findall(r"<label\b[^>]*>", markup, re.IGNORECASE)
    assert label_tags

    label_targets = []
    for label in label_tags:
        match = re.search(r"""\bfor=["']([^"']+)["']""", label, re.IGNORECASE)
        assert match, f"Label is missing a for attribute: {label}"
        label_targets.append(match.group(1))

    control_ids = set(
        re.findall(
            r"""<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["']""",
            markup,
            re.IGNORECASE,
        )
    )
    assert set(label_targets) <= control_ids
    assert len(control_ids) == len(set(control_ids)), "Control IDs must be unique"


def test_submission_form_has_native_identity_validation_and_live_status():
    source = FORM.read_text(encoding="utf-8")
    name = _opening_tag(source, "bcl-name")
    email = _opening_tag(source, "bcl-email")
    status = _opening_tag(source, "bcl-submit-result")

    assert "required" in name and 'autocomplete="name"' in name
    assert 'type="email"' in email and "required" in email
    assert 'autocomplete="email"' in email
    assert 'role="status"' in status and 'aria-live="polite"' in status
    assert 'href="mailto:hello@bouldercreeklocal.com"' in source


def test_submission_success_requires_http_and_service_confirmation():
    source = FORM.read_text(encoding="utf-8")
    assert "if(!r.ok)" in source
    assert "json.success !== true" in source
    assert '.setAttribute("role", "alert")' in source


def test_shared_layout_allows_mobile_children_to_shrink_and_stack():
    source = HEADER.read_text(encoding="utf-8")
    assert "grid-template-columns: minmax(0, 1fr) !important" in source
    assert ".bcl-hero-grid > *" in source
    assert ".bcl-tool {" in source and "min-width: 0;" in source
    assert "@media (max-width: 480px)" in source
    assert ".bcl-actions { align-items: stretch; flex-direction: column; }" in source
    assert "margin-left: 50%" not in source
    assert "100vw" not in source
