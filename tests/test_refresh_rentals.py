from rentals.refresh_rentals import (
    PUBLIC_SCHEMA_KEYS,
    build_rentals,
    fetch_raw,
    preserve_first_seen,
)
from rentals.sources import RENTAL_SOURCES

TODAY = "2026-07-19"

RENTVINE_SOURCE = next(s for s in RENTAL_SOURCES if s["name"] == "PMI Santa Cruz")
# Streamline 831 is disabled in the production registry (no listings, 2026-09-13);
# these tests pin its captured fixture, so force-enable a copy rather than
# depending on production registry state.
STREAMLINE_SOURCE = dict(next(s for s in RENTAL_SOURCES if s["name"] == "Streamline 831"), enabled=True)
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
    published, queued, had_errors, _counts = build_rentals(SUBSET, _ok_fetchers(), TODAY)
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
    published1, queued1, _, _ = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    published2, queued2, _, _ = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    assert len(published1) == len(published2)
    assert len(queued1) == len(queued2)


def test_second_refresh_preserves_discovery_date_and_advances_verified_date():
    first, _queued, _errors, _counts = build_rentals(
        SUBSET, _ok_fetchers(), TODAY, manual_path="__no_such_file__.json",
    )
    later, _queued, _errors, _counts = build_rentals(
        SUBSET, _ok_fetchers(), "2026-09-16", manual_path="__no_such_file__.json",
        previous_rentals=first,
    )

    assert later
    assert all(r["first_seen_at"] == TODAY for r in later)
    assert all(r["last_verified_at"] == "2026-09-16" for r in later)


def test_preserve_first_seen_ignores_invalid_and_future_history():
    rows = [{"id": "same", "first_seen_at": "2026-09-16"}]
    preserve_first_seen(rows, [{"id": "same", "first_seen_at": "tomorrow"}], "2026-09-16")
    assert rows[0]["first_seen_at"] == "2026-09-16"


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

    published, queued, had_errors, _counts = build_rentals(SUBSET, _ok_fetchers(), TODAY)

    assert had_errors is False
    assert calls["n"] > 1  # later rows in the same/other sources still processed
    assert published or queued  # the run was not dropped entirely


def test_per_source_exception_sets_had_errors_but_other_source_still_yields():
    def _fetch(url, **kw):
        if url == RENTVINE_SOURCE["url"]:
            raise RuntimeError("network down")
        return _markdown_by_url(url, **kw)

    published, queued, had_errors, _counts = build_rentals(SUBSET, {"firecrawl_markdown": _fetch}, TODAY)
    assert had_errors is True
    assert published or queued
    assert all(r["source"] == "Streamline 831" for r in published)


def test_failed_fetch_retains_cached_rows_without_claiming_fresh_verification():
    prior, _queued, _errors, _counts = build_rentals(
        [RENTVINE_SOURCE], _ok_fetchers(), TODAY, manual_path="__no_such_file__.json",
    )
    assert prior

    def fail(_url, **_kw):
        raise RuntimeError("network down")

    published, _queued, had_errors, counts = build_rentals(
        [RENTVINE_SOURCE], {"firecrawl_markdown": fail}, "2026-09-16",
        manual_path="__no_such_file__.json", previous_rentals=prior,
    )

    assert had_errors is True
    assert counts["PMI Santa Cruz"] == 0
    assert published == prior
    assert all(r["last_verified_at"] == TODAY for r in published)


def test_build_rentals_reports_rows_parsed_per_source_for_the_alarm():
    """The alarm has to watch rows PARSED, not rows PUBLISHED.

    Most SLV property managers list the whole county, so an SLV-empty week is
    ordinary and must never alarm. A parser that has stopped matching anything
    is the failure the alarm exists for, and only the parse count can tell
    them apart.
    """
    _published, _queued, _had_errors, counts = build_rentals(SUBSET, _ok_fetchers(), TODAY)
    assert set(counts) == {"PMI Santa Cruz", "Streamline 831"}
    assert all(n > 0 for n in counts.values())


def test_a_source_that_fails_to_fetch_is_counted_as_zero_not_omitted():
    """Omitting it would let the streak reset itself every time a source broke."""
    def _fetch(url, **kw):
        if url == RENTVINE_SOURCE["url"]:
            raise RuntimeError("network down")
        return _markdown_by_url(url, **kw)

    _p, _q, _e, counts = build_rentals(SUBSET, {"firecrawl_markdown": _fetch}, TODAY)
    assert counts["PMI Santa Cruz"] == 0
    assert counts["Streamline 831"] > 0


# --- Pagination (per-source config: page_url_template + max_pages) ---

_PAGED_SOURCE = {
    "name": "paged", "url": "https://p.test/listings", "enabled": True, "parser": "appfolio",
    "config": {"page_url_template": "https://p.test/listings/listings?page={n}", "max_pages": 5},
}


def _page(*ids):
    return "\n".join("[x](https://p.test/listings/detail/%s)" % i for i in ids)


def test_fetch_raw_concatenates_pages_until_one_adds_no_new_detail_urls():
    served = {
        "https://p.test/listings": _page("a1", "a2"),
        "https://p.test/listings/listings?page=2": _page("b1"),
        "https://p.test/listings/listings?page=3": "",
        "https://p.test/listings/listings?page=4": _page("never"),
    }
    calls = []

    def fake(url, **kw):
        calls.append(url)
        return served[url]

    md = fetch_raw(_PAGED_SOURCE, {"firecrawl_markdown": fake})
    assert calls == ["https://p.test/listings", "https://p.test/listings/listings?page=2",
                     "https://p.test/listings/listings?page=3"]
    assert "detail/a1" in md and "detail/b1" in md and "never" not in md


def test_fetch_raw_stops_when_a_portal_repeats_page_one():
    calls = []

    def fake(url, **kw):
        calls.append(url)
        return _page("a1", "a2")

    md = fetch_raw(_PAGED_SOURCE, {"firecrawl_markdown": fake})
    assert len(calls) == 2
    assert md == _page("a1", "a2")


def test_fetch_raw_honors_max_pages():
    calls = []

    def fake(url, **kw):
        calls.append(url)
        return _page("u%d" % len(calls))

    fetch_raw(_PAGED_SOURCE, {"firecrawl_markdown": fake})
    assert len(calls) == 5


def test_fetch_raw_without_pagination_config_fetches_once():
    calls = []

    def fake(url, **kw):
        calls.append(url)
        return _page("a1")

    fetch_raw({"url": "https://p.test/listings"}, {"firecrawl_markdown": fake})
    assert calls == ["https://p.test/listings"]


def test_build_rentals_publishes_utopia_felton_row_from_paginated_fixture():
    utopia = next(s for s in RENTAL_SOURCES if s["name"] == "Utopia Management")
    page1 = open("tests/fixtures/appfolio_utopia.md", encoding="utf-8").read()

    def fake(url, **kw):
        return page1 if url == utopia["url"] else ""

    published, _queued, had_errors, counts = build_rentals([utopia], {"firecrawl_markdown": fake}, TODAY)
    assert had_errors is False
    assert counts["Utopia Management"] == 300
    assert [(r["address_public"], r["postal_code"], r["monthly_rent"]) for r in published] == [
        ("10585 Redwood Dr.", "95018", None)]
