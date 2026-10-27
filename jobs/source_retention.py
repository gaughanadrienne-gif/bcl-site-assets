"""Private retention for unconfirmed source losses, never public fallback rows."""
from copy import deepcopy
from dataclasses import dataclass
from datetime import date
import re
from urllib.parse import urlsplit

from jobs.identity import job_identity_url

SOURCE_FAILURES = {"empty-response", "fetch-or-parse-failed", "parser-unavailable"}
SOURCE_REASONS = {"source-response-unverified", "source-membership-unverified"}
RECHECKED_REASONS = {"ambiguous-location", "missing-fields", "excluded-keyword",
                    "remote-local-evidence-required", "employer-detail-review-required", "expired-deadline"}


@dataclass(frozen=True)
class VerifiedClosure:
    canonical_url: str
    verified_at: str
    evidence_url: str
    evidence_sha256: str


@dataclass(frozen=True)
class SourceParseResult:
    """Trusted parser contract for explicit per-recruitment closure evidence.

    Plain list results, including [], never assert verified closures. No current
    Paycom adapter supplies this contract; empty Paycom output stays unconfirmed.
    """
    jobs: list
    verified_closures: tuple = ()


def unpack_source_result(parsed, source, today):
    if not isinstance(parsed, SourceParseResult):
        if not isinstance(parsed, list):
            raise ValueError("source parser must return a list or SourceParseResult")
        return parsed, {}
    if not isinstance(parsed.jobs, list):
        raise ValueError("source result jobs must be a list")
    active = {job_identity_url(row.get("url") or row.get("canonical_url"))
              for row in parsed.jobs}
    closures = {}
    for evidence in parsed.verified_closures:
        if not isinstance(evidence, VerifiedClosure):
            raise ValueError("closure needs explicit verified evidence")
        key = job_identity_url(evidence.canonical_url)
        valid_date = date.fromisoformat(evidence.verified_at).isoformat() == today
        allowed_evidence = {key, job_identity_url(source.get("url"))}
        if (not key or urlsplit(evidence.canonical_url).scheme != "https"
                or not urlsplit(evidence.canonical_url).hostname
                or not valid_date or urlsplit(evidence.evidence_url).scheme != "https"
                or not urlsplit(evidence.evidence_url).hostname
                or job_identity_url(evidence.evidence_url) not in allowed_evidence
                or not re.fullmatch(r"[0-9a-f]{64}", evidence.evidence_sha256)
                or key in active or key in closures):
            raise ValueError("invalid or conflicting verified closure")
        closures[key] = evidence
    return parsed.jobs, closures


def _prior_by_url(previous_jobs, source_name):
    grouped = {}
    for row in previous_jobs or []:
        key = job_identity_url(row.get("canonical_url"))
        if not key or row.get("source") != source_name:
            continue
        grouped.setdefault(key, []).append(row)
    prior = {}
    for key, rows in grouped.items():
        # Main passes public, current pending, then durable source history.
        # An old scheduler can regenerate automatic pending rows with new IDs
        # and dates. Durable history wins their identity/observation baseline.
        closed = next((r for r in rows if r.get("verification_status") == "closed"), None)
        source_held = next((r for r in rows if r.get("_source_review_required")), None)
        pending = next((r for r in rows if r.get("_queue_reason")), None)
        selected = deepcopy(closed or source_held or pending or rows[0])
        # A newer owner/manual hold in current pending still controls release.
        # Merge its private notes, not its regenerated identity/verification dates.
        manual = next((r for r in rows if _manual_hold(r)), None)
        if manual:
            _preserve_hold_metadata(selected, manual)
            if selected.get("verification_status") == "closed":
                selected["_previous_queue_reason"] = manual["_queue_reason"]
            else:
                selected["_queue_reason"] = manual["_queue_reason"]
        prior[key] = selected
    return prior


def _manual_hold(row):
    reason = row.get("_queue_reason", "")
    return (row.get("verification_status") != "closed" and reason
            and reason not in SOURCE_REASONS and reason not in RECHECKED_REASONS
            and not reason.startswith("reviewed-fields-"))


def retain_source_history(source, outcome, published, queued, previous_jobs, closures, today):
    """Retain uncertainty and verified closure records only in private results."""
    name = source["name"]
    prior = _prior_by_url(previous_jobs, name)
    public_by_url = {}
    pending_by_url = {}
    # Align with dedupe_by's first-result precedence. Mutating the last duplicate
    # can lose its ID/hold when final deduplication keeps the first result.
    for row in published:
        public_by_url.setdefault(job_identity_url(row.get("canonical_url")), row)
    for row in queued:
        pending_by_url.setdefault(job_identity_url(row.get("canonical_url")), row)
    failed = outcome["status"] in SOURCE_FAILURES or outcome.get("row_errors", 0) > 0
    retained = closed = 0
    for key, old in prior.items():
        evidence = closures.get(key)
        if evidence:
            if key in public_by_url or key in pending_by_url:
                # A different enabled source may still report the same posting.
                # Conflicting evidence needs review, never a public/closed pair.
                _remove_public(published, key)
                snapshot = deepcopy(old)
                snapshot.update(verification_status="pending-review",
                                _source_review_required=True,
                                _source_response_status="source-closure-conflict",
                                _source_response_observed_on=today)
                snapshot.setdefault("_queue_reason", "source-closure-conflict")
                snapshot.update(_closure_conflict_verified_at=evidence.verified_at,
                                _closure_conflict_evidence_url=evidence.evidence_url,
                                _closure_conflict_evidence_sha256=evidence.evidence_sha256)
                if key in pending_by_url:
                    snapshot["_conflicting_source"] = pending_by_url[key].get("source")
                    snapshot["_conflicting_gate_reason"] = pending_by_url[key].get("_queue_reason")
                    _remove_private(queued, key)
                queued.append(snapshot)
                pending_by_url[key] = snapshot
                retained += 1
                continue
            snapshot = deepcopy(old)
            if old.get("_queue_reason") and old.get("verification_status") != "closed":
                snapshot["_previous_queue_reason"] = old["_queue_reason"]
            snapshot.update(verification_status="closed", _queue_reason="source-closed-verified",
                            _source_review_required=False,
                            _closure_verified_at=evidence.verified_at,
                            _closure_evidence_url=evidence.evidence_url,
                            _closure_evidence_sha256=evidence.evidence_sha256)
            if key in pending_by_url:
                _remove_private(queued, key)
            queued.append(snapshot)
            pending_by_url[key] = snapshot
            closed += 1
            continue
        if key in public_by_url:
            current = public_by_url[key]
            if old.get("_source_review_required") or old.get("verification_status") == "closed":
                for fresh in published:
                    if job_identity_url(fresh.get("canonical_url")) == key:
                        fresh["id"] = old["id"]
            hold = (old.get("_previous_queue_reason", "") if old.get("verification_status") == "closed"
                    else old.get("_queue_reason", ""))
            rechecked = hold in RECHECKED_REASONS or (
                hold.startswith("reviewed-fields-")
                and current.get("field_reviewed_at", "") > old.get("field_reviewed_at", ""))
            if hold and hold not in SOURCE_REASONS and not rechecked:
                _remove_public(published, key)
                snapshot = deepcopy(current)
                _preserve_hold_metadata(snapshot, old)
                snapshot.update(id=old["id"], verification_status="pending-review", _queue_reason=hold)
                if key in pending_by_url:
                    _remove_private(queued, key)
                queued.append(snapshot)
                pending_by_url[key] = snapshot
            # Fresh validated rows resolve source-only uncertainty; no marker leaks publicly.
            continue
        if key in pending_by_url:
            current = pending_by_url[key]
            hold = (old.get("_previous_queue_reason", "") if old.get("verification_status") == "closed"
                    else old.get("_queue_reason", ""))
            if old.get("_source_review_required") or old.get("verification_status") == "closed":
                current["id"] = old["id"]
            # Current field/geography gates outrank an older automatically
            # evaluated hold. Unknown/manual holds still require their reviewer.
            if hold and hold not in SOURCE_REASONS and hold not in RECHECKED_REASONS and not hold.startswith("reviewed-fields-"):
                _preserve_hold_metadata(current, old)
                current["id"] = old["id"]
                current["verification_status"] = "pending-review"
                current["_queue_reason"] = hold
            continue
        if old.get("verification_status") == "closed":
            queued.append(deepcopy(old))
            pending_by_url[key] = queued[-1]
            continue
        # Nonempty does not prove pagination/completeness. A missing posting is
        # still private uncertainty until explicit closure evidence resolves it.
        snapshot = deepcopy(old)
        snapshot["verification_status"] = "pending-review"
        snapshot.setdefault("_queue_reason", "source-response-unverified" if failed else "source-membership-unverified")
        snapshot.update(_source_review_required=True, _source_response_status=outcome["status"],
                        _source_response_observed_on=today)
        queued.append(snapshot)
        pending_by_url[key] = snapshot
        retained += 1
    outcome["retained_private_records"] = retained
    outcome["verified_closed_records"] = closed


def _preserve_hold_metadata(current, old):
    for key, value in old.items():
        if key.startswith("_") and not key.startswith(("_source", "_closure")) and key != "_queue_reason":
            current[key] = deepcopy(value)


def _remove_public(published, key):
    published[:] = [j for j in published if job_identity_url(j.get("canonical_url")) != key]


def _remove_private(queued, key):
    queued[:] = [j for j in queued if job_identity_url(j.get("canonical_url")) != key]


def split_private_results(queued):
    """Closed snapshots stay archived; active review and history remain private."""
    pending = [j for j in queued if j.get("verification_status") != "closed"]
    history = [j for j in queued if j.get("_source_review_required") or j.get("verification_status") == "closed"]
    return pending, history
