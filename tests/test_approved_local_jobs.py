from jobs.refresh_jobs import build_jobs


def test_approved_batch_retains_review_date_not_refresh_date():
    rows, queued, _ = build_jobs([], {}, "2026-09-14")
    assert len(rows) == 4 and not queued
    assert all(j["last_verified_at"] == "2026-09-13" for j in rows)
    assert all(j["posted_at"] == "" for j in rows)
    assert all(j["source"] != "Community submission" for j in rows)
    assert sum(j["city"] == "Mount Hermon" for j in rows) == 3
    assert sum(j["city"] == "Felton" for j in rows) == 1


def test_approved_batch_expires_without_renewal():
    rows, queued, _ = build_jobs([], {}, "2026-10-14")
    assert rows == queued == []
