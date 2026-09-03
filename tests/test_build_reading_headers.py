from PIL import Image

from scripts.build_reading_headers import CANVAS, crop_metrics, encode_webp, render_header


def test_render_header_uses_the_shared_card_geometry():
    source = Image.new("RGB", (1200, 896), "white")
    rendered = render_header(source)

    assert rendered.size == CANVAS == (1200, 630)


def test_common_source_crop_is_vertical_and_below_review_threshold():
    cropped_width, cropped_height = crop_metrics((1200, 896))

    assert cropped_width == 0
    assert 0.29 < cropped_height < 0.30


def test_webp_encoder_returns_a_valid_standard_derivative():
    encoded = encode_webp(Image.new("RGB", CANVAS, "white"))

    assert encoded.startswith(b"RIFF")
    assert encoded[8:12] == b"WEBP"
