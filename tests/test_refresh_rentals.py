from rentals.refresh_rentals import PUBLIC_SCHEMA_KEYS, build_rentals
from rentals.sources import RENTAL_SOURCES

TODAY = "2026-07-19"

RENTVINE_SOURCE = next(s for s in RENTAL_SOURCES if s["name"] == "PMI Santa Cruz")
STREAMLINE_SOURCE = next(s for s in RENTAL_SOURCES if s["name"] == "Streamline 831")
SUBSET = [RENTVINE_SOURCE, STREAMLINE_SOURCE]

RENTVINE_MD = open("tests/fixtures/rentvine_pmi.md", encoding="utf-8").read()
STREAMLINE_MD = open("tests/fixtures/streamline_rentals.md", encoding="utf-8").read()


def _markdown_by_url(url, **kw):
    if url == RENTVINE_SOURCE["url"]:
        return RENTVINE_MD
    if url == STREAMLINE_SOURCE["url"]:
        return STREAMLINE_MD
    raise RuntimeError("unexpected url %r" % url)


def _ok_fetchers():
    return {"firecrawl_markdown": _markdown_by_url}


def test_build_rentals_publishes_slv_and_queues_undisclosed():
    published, queued, had_errors = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    assert had_errors is False

    for rental in published:
        for key in PUBLIC_SCHEMA_KEYS:
            assert key in rental
        assert rental["postal_code"] in ("95005", "95006", "95007", "95018")
        assert rental["locality"]

    assert any(r["address_public"] == "12895 Highway 9" for r in published)
    # SLV widening (plan 4b): the Ben Lomond/Brookdale fixture listings now
    # publish too, each labeled with its town.
    assert any(r["locality"] == "Ben Lomond" for r in published)
    assert any(r["locality"] == "Brookdale" for r in published)

    queued_reasons = [q.get("_queue_reason") for q in queued]
    assert any(reason == "undisclosed-slv-verify" for reason in queued_reasons)
    assert any("Boulder Creek" in q.get("city", "") for q in queued)

    # The Streamline commercial 95006 listing is excluded from both sets.
    assert not any(r.get("property_type", "").lower() == "commercial" for r in published)
    assert not any(q.get("property_type", "").lower() == "commercial" for q in queued)


def test_build_rentals_is_idempotent():
    published1, queued1, _ = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    published2, queued2, _ = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    assert len(published1) == len(published2)
    assert len(queued1) == len(queued2)


def test_bad_row_is_skipped_without_setting_had_errors(monkeypatch):
    import rentals.refresh_rentals as refresh_rentals_mod

    orig_normalize = refresh_rentals_mod.normalize_rental
    calls = {"n": 0}

    def flaky_normalize(raw, source, today):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ValueError("malformed row")
        return orig_normalize(raw, source, today)

    monkeypatch.setattr(refresh_rentals_mod, "normalize_rental", flaky_normalize)

    published, queued, had_errors = build_rentals(SUBSET, _ok_fetchers(), TODAY)

    assert had_errors is False
    assert calls["n"] > 1  # later rows in the same/other sources still processed
    assert published or queued  # the run was not dropped entirely


def test_per_source_exception_sets_had_errors_but_other_source_still_yields():
    def _fetch(url, **kw):
        if url == RENTVINE_SOURCE["url"]:
            raise RuntimeError("network down")
        return _markdown_by_url(url, **kw)

    published, queued, had_errors = build_rentals(SUBSET, {"firecrawl_markdown": _fetch}, TODAY)
    assert had_errors is True
    assert published or queued
    assert all(r["source"] == "Streamline 831" for r in published)
