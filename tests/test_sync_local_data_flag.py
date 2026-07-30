"""Tests for the --local flag on the two CDN-reading directory/food builders.

WHY THIS EXISTS: build_listing_schema.py and build_static_listings.py live in
Automation & Operations/sync, outside this repo, and read data/*.json from the
CDN with no local option. On 2026-07-29 a listing was removed from the local
directory.json here, and those two scripts silently rebuilt against the
still-published, pre-removal CDN copy with no signal that local and published
data disagreed. These tests cover the fix: default behaviour is untouched
(CDN, always), --local reads disk instead, and a mismatch between local and
CDN prints a warning (silence when they agree).

The scripts are imported by file path rather than as a package, since they are
not part of this repo (they live in a sibling folder, Automation & Operations,
under the shared Boulder Creek Local root) and are not installed as one.
"""
import importlib.util
import io
import json
import os

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # bcl-site-assets
BCL_ROOT = os.path.dirname(os.path.dirname(REPO_ROOT))  # Boulder Creek Local
SYNC_DIR = os.path.join(BCL_ROOT, "Automation & Operations", "sync")


def _load_module(name, filename):
    path = os.path.join(SYNC_DIR, filename)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Neither script does network or disk I/O at import time (both only act
# inside build()/load(), called from __main__), so loading them here is safe.
listing_schema = _load_module("bcl_sync_build_listing_schema", "build_listing_schema.py")
static_listings = _load_module("bcl_sync_build_static_listings", "build_static_listings.py")

MODULES = [listing_schema, static_listings]


def _fake_urlopen(payload, calls):
    def urlopen(url, timeout=60):
        calls.append(url)
        return io.BytesIO(json.dumps(payload).encode("utf-8"))
    return urlopen


def _refuse_urlopen(*_a, **_kw):
    raise AssertionError("--local must never touch the network")


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_data_path_resolves_the_same_way_build_search_index_does(mod):
    """build_search_index.py resolves DATA as HERE/../../Website/bcl-site-assets/data.
    These two scripts must land on the exact same directory (this repo's
    data/), not a new/invented path."""
    assert mod.DATA == os.path.join(REPO_ROOT, "data")


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_default_reads_cdn_and_prints_the_source(mod, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(mod, "DATA", str(tmp_path))  # no local file present
    calls = []
    monkeypatch.setattr(mod.urllib.request, "urlopen", _fake_urlopen({"listings": []}, calls))

    result = mod.load("directory.json")

    assert result == {"listings": []}
    assert calls == [mod.CDN + "directory.json"]
    out = capsys.readouterr().out
    assert "CDN" in out
    assert "directory.json" in out


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_local_flag_reads_disk_and_never_touches_the_network(mod, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(mod, "DATA", str(tmp_path))
    monkeypatch.setattr(mod.urllib.request, "urlopen", _refuse_urlopen)
    fixture = {"listings": [{"name": "Local Only Business"}]}
    (tmp_path / "directory.json").write_text(json.dumps(fixture), encoding="utf-8")

    result = mod.load("directory.json", local=True)

    assert result == fixture
    out = capsys.readouterr().out
    assert "LOCAL" in out
    assert "mtime" in out


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_mismatch_warning_fires_when_local_and_cdn_disagree(mod, tmp_path, monkeypatch, capsys):
    """This is the exact scenario from the 2026-07-29 incident: the local copy
    was already edited (a listing removed) but the CDN had not caught up."""
    monkeypatch.setattr(mod, "DATA", str(tmp_path))
    local_data = {"listings": [{"name": "A"}]}
    cdn_data = {"listings": [{"name": "A"}, {"name": "B"}]}
    (tmp_path / "directory.json").write_text(json.dumps(local_data), encoding="utf-8")
    calls = []
    monkeypatch.setattr(mod.urllib.request, "urlopen", _fake_urlopen(cdn_data, calls))

    result = mod.load("directory.json")  # default: CDN

    assert result == cdn_data, "CDN mode must still return the published data"
    out = capsys.readouterr().out
    assert "WARNING" in out
    assert "disagree" in out
    assert "PUBLISHED" in out


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_no_warning_when_local_and_cdn_agree(mod, tmp_path, monkeypatch, capsys):
    same = {"listings": [{"name": "A"}, {"name": "B"}]}
    (tmp_path / "directory.json").write_text(json.dumps(same), encoding="utf-8")
    monkeypatch.setattr(mod, "DATA", str(tmp_path))
    calls = []
    monkeypatch.setattr(mod.urllib.request, "urlopen", _fake_urlopen(same, calls))

    result = mod.load("directory.json")

    assert result == same
    out = capsys.readouterr().out
    assert "WARNING" not in out
    assert "CDN" in out


@pytest.mark.parametrize("mod", MODULES, ids=["build_listing_schema", "build_static_listings"])
def test_no_warning_when_no_local_copy_exists_to_compare(mod, tmp_path, monkeypatch, capsys):
    """An empty data/ dir (e.g. a fresh checkout) is not a mismatch; there is
    nothing to compare against, so no warning should fire."""
    monkeypatch.setattr(mod, "DATA", str(tmp_path))
    calls = []
    monkeypatch.setattr(mod.urllib.request, "urlopen", _fake_urlopen({"listings": []}, calls))

    mod.load("directory.json")

    out = capsys.readouterr().out
    assert "WARNING" not in out
