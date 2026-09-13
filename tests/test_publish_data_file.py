"""publish_data_file.py: scheduled data publishes must survive other sessions.

Regression for 2026-09-13, when every daily refresh push was rejected
non-fast-forward for two days after another session pushed first. Each test builds
throwaway repositories, so nothing here touches the real remote.
"""
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import publish_data_file as pub  # noqa: E402


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def clone(remote, dest):
    subprocess.run(["git", "clone", "-q", str(remote), str(dest)], check=True, capture_output=True)
    run(dest, "config", "user.email", "test@example.com")
    run(dest, "config", "user.name", "test")
    return dest


@pytest.fixture
def repos(tmp_path):
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], check=True)
    a = clone(remote, tmp_path / "a")
    (a / "data").mkdir()
    (a / "data" / "jobs.json").write_text('{"v": 1}\n')
    (a / "data" / "articles.json").write_text('{"a": 1}\n')
    run(a, "add", ".")
    run(a, "commit", "-qm", "init")
    run(a, "push", "-q", "origin", "main")
    b = clone(remote, tmp_path / "b")
    return remote, a, b


def remote_show(remote, spec):
    return subprocess.run(["git", "--git-dir", str(remote), "show", spec],
                          check=True, capture_output=True, text=True).stdout


def other_session_pushes(b, name):
    run(b, "pull", "-q")
    (b / name).write_text("image\n")
    run(b, "add", name)
    run(b, "commit", "-qm", "other session")
    run(b, "push", "-q", "origin", "main")


def test_publishes_on_top_of_a_remote_that_moved(repos):
    remote, a, b = repos
    other_session_pushes(b, "brand.jpg")
    (a / "data" / "jobs.json").write_text('{"v": 2}\n')
    pub.publish(a, ["data/jobs.json"], "Daily jobs refresh", log=lambda m: None)
    assert remote_show(remote, "main:data/jobs.json") == '{"v": 2}\n'
    assert remote_show(remote, "main:brand.jpg") == "image\n", "the other session's commit survives"


def test_other_sessions_uncommitted_edits_are_never_touched(repos):
    remote, a, b = repos
    other_session_pushes(b, "brand.jpg")
    wip = '{"a": "work in progress from another session"}\n'
    (a / "data" / "articles.json").write_text(wip)
    (a / "data" / "jobs.json").write_text('{"v": 2}\n')
    pub.publish(a, ["data/jobs.json"], "Daily jobs refresh", log=lambda m: None)
    assert (a / "data" / "articles.json").read_text() == wip
    assert remote_show(remote, "main:data/articles.json") == '{"a": 1}\n', "WIP is not published"
    assert run(a, "diff", "--cached", "--name-only") == "", "nothing else left staged"


def test_unchanged_file_publishes_nothing(repos):
    remote, a, _ = repos
    before = run(a, "rev-parse", "origin/main")
    pub.publish(a, ["data/jobs.json"], "Daily jobs refresh", log=lambda m: None)
    assert subprocess.run(["git", "--git-dir", str(remote), "rev-parse", "main"],
                          capture_output=True, text=True).stdout.strip() == before


def test_a_stranded_local_commit_is_not_published(repos):
    remote, a, b = repos
    (a / "note.txt").write_text("local only\n")
    run(a, "add", "note.txt")
    run(a, "commit", "-qm", "local only")
    other_session_pushes(b, "brand.jpg")
    (a / "data" / "jobs.json").write_text('{"v": 3}\n')
    pub.publish(a, ["data/jobs.json"], "Daily jobs refresh", log=lambda m: None)
    assert remote_show(remote, "main:data/jobs.json") == '{"v": 3}\n'
    missing = subprocess.run(["git", "--git-dir", str(remote), "cat-file", "-e", "main:note.txt"])
    assert missing.returncode != 0


def test_bad_paths_fail_loudly(repos):
    _, a, _ = repos
    assert pub.main(["--repo", str(a), "-m", "x", "data/nope.json"]) == 1
    assert pub.main(["--repo", str(a), "-m", "x", "../outside.json"]) == 1
