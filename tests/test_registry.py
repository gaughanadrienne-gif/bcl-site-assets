import pytest
from shared.registry import validate_registry, RegistryError


def _src(**over):
    base = dict(
        name="X", tool="jobs", collection_class="direct_page_reviewed",
        platform="neogov", parser="neogov", url="https://x.test/jobs",
        geo="area", priority=10, enabled=True, terms_ok=True,
    )
    base.update(over)
    return base


def test_valid_registry_passes_through():
    src = [_src(name="A"), _src(name="B")]
    assert validate_registry(src) is src

def test_missing_field_raises():
    bad = _src()
    del bad["url"]
    with pytest.raises(RegistryError):
        validate_registry([bad])

def test_bad_collection_class_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(collection_class="nonsense")])

def test_unknown_parser_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(parser="magic")])

def test_url_must_be_http():
    with pytest.raises(RegistryError):
        validate_registry([_src(url="ftp://x/y")])

def test_duplicate_names_raise():
    with pytest.raises(RegistryError):
        validate_registry([_src(name="A"), _src(name="A")])

def test_enabled_requires_terms_ok():
    with pytest.raises(RegistryError):
        validate_registry([_src(enabled=True, terms_ok=False)])

def test_enabled_discovery_only_raises():
    with pytest.raises(RegistryError):
        validate_registry([_src(collection_class="discovery_only", enabled=True, terms_ok=True)])

def test_discovery_only_disabled_is_valid():
    assert validate_registry([_src(collection_class="discovery_only", parser="discovery",
                                   enabled=False, terms_ok=False)])
