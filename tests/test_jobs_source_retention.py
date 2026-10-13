"""Offline regressions for source uncertainty and durable private recovery."""
from copy import deepcopy
import hashlib
import json

import pytest

from jobs import refresh_jobs as refresh
from jobs.normalize import normalize_job
from jobs.source_retention import SourceParseResult, VerifiedClosure, split_private_results

TODAY = "2026-10-13"
SOURCE = {"name": "Retention fixture", "parser": "retention-test", "platform": "custom_html",
          "url": "https://employer.example/jobs", "enabled": True}


def raw(n=1, **fields):
    return {"title": "Office Assistant", "employer": "Fixture Employer", "city": "Boulder Creek",
            "url": "https://employer.example/jobs/%d" % n, **fields}


def prior(n=1, **fields):
    job = normalize_job(raw(n), SOURCE, "2026-10-12")
    job.update(id="stable-%d" % n, first_seen_at="2026-09-13", field_reviewed_at="2026-10-12")
    job.update(fields)
    return job


def build(monkeypatch, result, previous, sources=None, fetcher=None, today=TODAY):
    monkeypatch.setitem(refresh.PARSERS, "retention-test", lambda *args: result)
    diagnostics = {}
    published, queued, counts = refresh.build_jobs(
        sources or [SOURCE], {"firecrawl_markdown": fetcher or (lambda *a, **k: "offline")},
        today, manual_path="__no_manual_entries__.json", previous_jobs=previous, diagnostics=diagnostics)
    return published, queued, diagnostics, counts


@pytest.mark.parametrize("failure", ["empty", "fetch", "parser", "missing-parser", "invalid-result"])
def test_unconfirmed_source_loss_retains_seven_privately(monkeypatch, failure):
    before = [prior(n) for n in range(1, 8)]
    saved = deepcopy(before)
    result = None if failure == "invalid-result" else []
    source = dict(SOURCE, parser="not-installed") if failure == "missing-parser" else SOURCE
    def fail(*args, **kwargs):
        raise RuntimeError("offline failure")
    if failure == "parser":
        monkeypatch.setitem(refresh.PARSERS, "retention-fail", fail)
        source = dict(SOURCE, parser="retention-fail")
    published, queued, diagnostics, _ = build(monkeypatch, result, before,
                                              sources=[source], fetcher=fail if failure == "fetch" else None)
    assert published == [] and len(queued) == 7
    assert before == saved
    for old, retained in zip(before, queued):
        assert retained["verification_status"] == "pending-review"
        assert retained["_queue_reason"] == "source-response-unverified"
        assert retained["_source_review_required"] is True
        for key, value in old.items():
            if key != "verification_status":
                assert retained[key] == value
    assert diagnostics[SOURCE["name"]]["retained_private_records"] == 7


def test_repeated_failure_deduplicates_public_pending_and_history(monkeypatch):
    previous = [prior(n) for n in range(1, 8)]
    _, retained, _, _ = build(monkeypatch, [], previous)
    _, again, _, _ = build(monkeypatch, [], previous + retained + retained, today="2026-10-14")
    assert len(again) == 7
    assert [j["id"] for j in again] == [j["id"] for j in previous]
    assert all(j["last_verified_at"] == "2026-10-12" and j["field_reviewed_at"] == "2026-10-12" for j in again)
    assert all(j["_source_response_observed_on"] == "2026-10-14" for j in again)


def test_failure_preserves_existing_hold_and_private_fields(monkeypatch):
    held = prior(_queue_reason="owner-review-hold", verification_status="pending-review",
                 _review_note="Do not release", _review_expires_at="2026-11-11")
    _, queued, _, _ = build(monkeypatch, [], [prior(), held])
    assert len(queued) == 1
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Do not release"
    assert queued[0]["_review_expires_at"] == "2026-11-11"


def test_six_good_jobs_do_not_defeat_failed_source_retention(monkeypatch):
    healthy = dict(SOURCE, name="Healthy source", parser="healthy-test", url="https://healthy.example/jobs")
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw(n, url="https://healthy.example/jobs/%d" % n) for n in range(1, 7)])
    published, queued, diagnostics, _ = build(monkeypatch, [], [prior(n) for n in range(1, 8)], sources=[SOURCE, healthy])
    assert len(published) == 6 >= refresh.MIN_SAFE_TOTAL
    assert len(queued) == 7
    assert diagnostics[SOURCE["name"]]["publication_candidates"] == 0


def test_partial_row_error_retains_unparsed_prior_record(monkeypatch):
    published, queued, diagnostics, _ = build(monkeypatch, [raw(1), None], [prior(1), prior(2)])
    assert len(published) == 1 and len(queued) == 1
    assert queued[0]["id"] == "stable-2"
    assert diagnostics[SOURCE["name"]]["row_errors"] == 1


def test_success_resolves_source_hold_with_stable_identity(monkeypatch):
    _, retained, _, _ = build(monkeypatch, [], [prior()])
    published, queued, _, _ = build(monkeypatch, [raw(url=raw()["url"] + "?utm_source=new")], retained,
                                    today="2026-10-14")
    assert len(published) == 1 and queued == []
    assert published[0]["id"] == "stable-1"
    assert published[0]["first_seen_at"] == "2026-09-13"
    assert published[0]["last_verified_at"] == "2026-10-14"
    assert not any(k.startswith("_source") or k == "_queue_reason" for k in published[0])


def test_success_does_not_erase_still_unseen_source_hold(monkeypatch):
    _, retained, _, _ = build(monkeypatch, [], [prior(1), prior(2)])
    published, queued, _, _ = build(monkeypatch, [raw(1)], retained)
    assert len(published) == len(queued) == 1
    assert queued[0]["id"] == "stable-2" and queued[0]["last_verified_at"] == "2026-10-12"


def test_successful_partial_response_retains_omitted_public_record(monkeypatch):
    published, queued, _, _ = build(monkeypatch, [raw(1)], [prior(1), prior(2)])
    assert len(published) == len(queued) == 1
    assert queued[0]["id"] == "stable-2"
    assert queued[0]["_queue_reason"] == "source-membership-unverified"
    assert queued[0]["last_verified_at"] == "2026-10-12"


def test_success_does_not_release_existing_manual_hold(monkeypatch):
    held = prior(_queue_reason="owner-review-hold", _source_review_required=True,
                 _review_note="Do not release", _review_expires_at="2026-11-11")
    published, queued, _, _ = build(monkeypatch, [raw()], [held])
    assert published == [] and len(queued) == 1
    assert queued[0]["id"] == "stable-1" and queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["verification_status"] == "pending-review"
    assert queued[0]["_review_note"] == held["_review_note"]
    assert queued[0]["_review_expires_at"] == held["_review_expires_at"]


def test_fresh_pending_gate_keeps_private_manual_review_metadata(monkeypatch):
    held = prior(_queue_reason="owner-review-hold", _review_note="Do not release")
    published, queued, _, _ = build(monkeypatch, [raw(city="")], [held])
    assert published == [] and queued[0]["id"] == "stable-1"
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Do not release"
    assert queued[0]["verification_status"] == "pending-review"


def test_fresh_gate_outranks_old_automatic_reason(monkeypatch):
    held = prior(_queue_reason="reviewed-fields-ambiguous-location", _source_review_required=True)
    published, queued, _, _ = build(monkeypatch, [raw(city="", title="Commission-only Sales")], [held])
    assert published == [] and len(queued) == 1
    assert queued[0]["_queue_reason"] != held["_queue_reason"]
    assert queued[0]["id"] == "stable-1"


def test_disabled_source_private_recovery_survives(monkeypatch):
    _, retained, _, _ = build(monkeypatch, [], [prior()])
    published, queued, _, _ = build(monkeypatch, [], retained, sources=[dict(SOURCE, enabled=False)])
    assert published == [] and queued == retained


def closure(n=1, **fields):
    values = {"canonical_url": raw(n)["url"], "verified_at": TODAY,
              "evidence_url": SOURCE["url"], "evidence_sha256": hashlib.sha256(b"recognized closed requisition").hexdigest()}
    values.update(fields)
    return VerifiedClosure(**values)


def test_explicit_verified_closures_archive_seven_without_republishing(monkeypatch):
    before = [prior(n, _queue_reason="owner-review-hold", _source_review_required=True) for n in range(1, 8)]
    published, queued, diagnostics, _ = build(monkeypatch, SourceParseResult([], tuple(closure(n) for n in range(1, 8))), before)
    pending, history = split_private_results(queued)
    assert published == pending == [] and len(history) == 7
    assert diagnostics[SOURCE["name"]]["verified_closed_records"] == 7
    for old, archived in zip(before, history):
        assert archived["id"] == old["id"]
        assert archived["last_verified_at"] == old["last_verified_at"]
        assert archived["field_reviewed_at"] == old["field_reviewed_at"]
        assert archived["_previous_queue_reason"] == "owner-review-hold"
        assert archived["verification_status"] == "closed"
        assert archived["_closure_evidence_sha256"] == closure().evidence_sha256
    _, again, _, _ = build(monkeypatch, [], history, today="2026-10-14")
    assert again == history


def test_reopened_posting_does_not_erase_previous_owner_hold(monkeypatch):
    held = prior(_queue_reason="owner-review-hold", _review_note="Do not release")
    _, archived, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [held])
    published, queued, _, _ = build(monkeypatch, [raw()], archived, today="2026-10-14")
    assert published == [] and queued[0]["id"] == "stable-1"
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Do not release"


@pytest.mark.parametrize("old_hold", ["owner-review-hold", ""])
def test_repeated_explicit_closure_preserves_preclosure_hold(monkeypatch, old_hold):
    old = prior(**({"_queue_reason": old_hold} if old_hold else {}))
    _, archived, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [old])
    _, repeated, _, _ = build(monkeypatch, SourceParseResult([], (closure(verified_at="2026-10-14"),)), archived,
                                today="2026-10-14")
    assert repeated[0].get("_previous_queue_reason", "") == old_hold
    published, queued, _, _ = build(monkeypatch, [raw()], repeated, today="2026-10-15")
    if old_hold:
        assert published == [] and queued[0]["_queue_reason"] == old_hold
    else:
        assert len(published) == 1 and queued == []
        assert published[0]["id"] == "stable-1"


def test_reopened_gated_posting_retains_closed_identity(monkeypatch):
    _, archived, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [prior()])
    published, queued, _, _ = build(monkeypatch, [raw(city="", url=raw()["url"] + "?utm_source=new")], archived,
                                    today="2026-10-14")
    assert published == [] and queued[0]["id"] == "stable-1"


@pytest.mark.parametrize("changes", [
    {"verified_at": "2026-10-12"}, {"verified_at": "not-a-date"},
    {"evidence_sha256": "missing"}, {"canonical_url": "http://employer.example/jobs/1"},
    {"evidence_url": "https://unrelated.example/closed"},
])
def test_invalid_closure_evidence_fails_into_review(monkeypatch, changes):
    published, queued, diagnostics, _ = build(monkeypatch, SourceParseResult([], (closure(**changes),)), [prior()])
    assert published == [] and queued[0]["verification_status"] == "pending-review"
    assert diagnostics[SOURCE["name"]]["status"] == "fetch-or-parse-failed"


def test_closure_active_conflict_in_same_source_fails_into_review(monkeypatch):
    published, queued, diagnostics, _ = build(monkeypatch, SourceParseResult([raw()], (closure(),)), [prior()])
    assert published == [] and queued[0]["verification_status"] == "pending-review"
    assert diagnostics[SOURCE["name"]]["verified_closed_records"] == 0


def test_closure_conflicting_with_other_source_requires_review(monkeypatch):
    healthy = dict(SOURCE, name="Healthy source", parser="healthy-test")
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw()])
    published, queued, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [prior()], sources=[SOURCE, healthy])
    assert published == [] and len(queued) == 1
    assert queued[0]["verification_status"] == "pending-review"
    assert queued[0]["_source_response_status"] == "source-closure-conflict"


def test_closure_conflicting_with_active_gated_source_requires_review(monkeypatch):
    healthy = dict(SOURCE, name="Gated source", parser="healthy-test")
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw(city="")])
    published, queued, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [prior()], sources=[SOURCE, healthy])
    assert published == [] and len(queued) == 1
    assert queued[0]["verification_status"] == "pending-review"
    assert queued[0]["_source_response_status"] == "source-closure-conflict"
    assert queued[0]["_conflicting_source"] == "Gated source"
    assert queued[0]["_conflicting_gate_reason"] == "ambiguous-location"


@pytest.mark.parametrize("history_first", [True, False])
def test_closed_history_wins_over_stale_pending_snapshot(monkeypatch, history_first):
    stale = prior(_queue_reason="owner-review-hold", _review_note="Do not release")
    _, archived, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [stale])
    previous = archived + [stale] if history_first else [stale] + archived
    _, result, _, _ = build(monkeypatch, [], previous, today="2026-10-14")
    assert result == archived


def test_durable_history_identity_wins_old_scheduler_automatic_pending(monkeypatch):
    durable = prior(_source_review_required=True, _queue_reason="source-response-unverified")
    stale = prior(id="regenerated", first_seen_at=TODAY, last_verified_at=TODAY,
                  _queue_reason="ambiguous-location")
    published, queued, _, _ = build(monkeypatch, [], [prior(id="public"), stale, durable])
    assert published == [] and len(queued) == 1
    assert queued[0]["id"] == "stable-1"
    assert queued[0]["first_seen_at"] == "2026-09-13"
    assert queued[0]["last_verified_at"] == "2026-10-12"
    assert queued[0]["_queue_reason"] == "source-response-unverified"


def test_current_manual_hold_merges_onto_durable_identity_and_dates(monkeypatch):
    durable = prior(_source_review_required=True, _queue_reason="source-response-unverified")
    newer_manual = prior(id="regenerated", first_seen_at=TODAY, last_verified_at=TODAY,
                         _queue_reason="owner-review-hold", _review_note="Current owner note",
                         _review_expires_at="2026-11-11")
    _, queued, _, _ = build(monkeypatch, [], [prior(id="public"), newer_manual, durable])
    assert len(queued) == 1 and queued[0]["id"] == "stable-1"
    assert queued[0]["first_seen_at"] == "2026-09-13" and queued[0]["last_verified_at"] == "2026-10-12"
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Current owner note"
    assert queued[0]["_review_expires_at"] == "2026-11-11"


def test_closure_conflict_removes_all_fresh_public_duplicates(monkeypatch):
    other = [dict(SOURCE, name=name, parser="healthy-test") for name in ("Healthy one", "Healthy two")]
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw()])
    published, queued, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [prior()], sources=[SOURCE, *other])
    assert published == [] and len(queued) == 1
    assert queued[0]["_source_response_status"] == "source-closure-conflict"


def test_source_hold_success_retains_id_across_fresh_public_duplicates(monkeypatch):
    other = [dict(SOURCE, name=name, parser="healthy-test") for name in ("Healthy one", "Healthy two")]
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw()])
    held = prior(_source_review_required=True, _queue_reason="source-response-unverified")
    published, queued, _, _ = build(monkeypatch, [], [held], sources=[SOURCE, *other])
    assert len(published) == 1 and queued == []
    assert published[0]["id"] == "stable-1"


def test_manual_hold_removes_all_fresh_public_and_pending_duplicates(monkeypatch):
    public_sources = [dict(SOURCE, name=name, parser="healthy-test") for name in ("Healthy one", "Healthy two")]
    pending_sources = [dict(SOURCE, name=name, parser="gated-test") for name in ("Gated one", "Gated two")]
    monkeypatch.setitem(refresh.PARSERS, "healthy-test", lambda *a: [raw()])
    monkeypatch.setitem(refresh.PARSERS, "gated-test", lambda *a: [raw(city="")])
    held = prior(_queue_reason="owner-review-hold", _review_note="Do not release")
    published, queued, _, _ = build(monkeypatch, [], [held], sources=[SOURCE, *public_sources, *pending_sources])
    assert published == [] and len(queued) == 1
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Do not release"


def test_closure_conflict_removes_all_fresh_pending_duplicates(monkeypatch):
    other = [dict(SOURCE, name=name, parser="gated-test") for name in ("Gated one", "Gated two")]
    monkeypatch.setitem(refresh.PARSERS, "gated-test", lambda *a: [raw(city="")])
    published, queued, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [prior()], sources=[SOURCE, *other])
    assert published == [] and len(queued) == 1
    assert queued[0]["_source_response_status"] == "source-closure-conflict"


@pytest.mark.parametrize("closed", [True, False])
def test_manual_hold_survives_two_pending_duplicates(monkeypatch, closed):
    other = [dict(SOURCE, name=name, parser="gated-test") for name in ("Gated one", "Gated two")]
    monkeypatch.setitem(refresh.PARSERS, "gated-test", lambda *a: [raw(city="")])
    held = prior(_queue_reason="owner-review-hold", _review_note="Do not release")
    if closed:
        _, previous, _, _ = build(monkeypatch, SourceParseResult([], (closure(),)), [held])
    else:
        previous = [held]
    published, queued, _, _ = build(monkeypatch, [], previous, sources=[SOURCE, *other])
    assert published == [] and len(queued) == 1
    assert queued[0]["id"] == "stable-1"
    assert queued[0]["_queue_reason"] == "owner-review-hold"
    assert queued[0]["_review_note"] == "Do not release"


def test_main_history_saved_before_aggregate_guard_and_reads_all_prior_stores(monkeypatch, tmp_path):
    private = prior(_source_review_required=True, _queue_reason="source-response-unverified")
    public_path = tmp_path / "jobs.json"; queue_path = tmp_path / "pending.json"; history_path = tmp_path / "history.json"
    for path, jobs in [(public_path, []), (queue_path, []), (history_path, [private])]:
        path.write_text(json.dumps({"jobs": jobs}), encoding="utf-8")
    monkeypatch.setattr(refresh, "JOBS_PATH", str(public_path))
    monkeypatch.setattr(refresh, "QUEUE_PATH", str(queue_path))
    monkeypatch.setattr(refresh, "SOURCE_HISTORY_PATH", str(history_path))
    monkeypatch.setattr(refresh, "_REVIEW_DIR", str(tmp_path))
    monkeypatch.setattr(refresh, "_pacific_today", lambda: TODAY)
    monkeypatch.setattr(refresh, "JOB_SOURCES", [SOURCE])
    monkeypatch.setitem(refresh.PARSERS, "retention-test", lambda *a: [])
    monkeypatch.setattr(refresh, "firecrawl_markdown", lambda *a, **k: "offline")
    writes = []
    original_writer = refresh.write_json_atomic
    def private_write(path, obj):
        writes.append(path)
        original_writer(path, obj)
    def guard(*a, **k):
        assert json.loads(history_path.read_text())["jobs"][0]["id"] == "stable-1"
        raise RuntimeError("minimum publication count")
    monkeypatch.setattr(refresh, "write_json_atomic", private_write)
    monkeypatch.setattr(refresh, "write_public_json_guarded", guard)
    with pytest.raises(RuntimeError, match="minimum publication count"):
        refresh.main()
    assert writes[0] == str(history_path)
    assert json.loads(public_path.read_text())["jobs"] == []
    assert json.loads(queue_path.read_text())["jobs"] == []
    assert json.loads(history_path.read_text())["jobs"][0]["last_verified_at"] == "2026-10-12"
