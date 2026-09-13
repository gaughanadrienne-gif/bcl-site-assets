"""Publish generated data files to GitHub without touching anyone's working tree.

Used by the scheduled refresh wrappers (jobs, rentals, rain/river, search index).

WHY THIS EXISTS (2026-09-13). The wrappers used to run `git add`, `git commit`,
`git push` in the shared checkout. The moment any other session pushed first, every
push was rejected non-fast-forward, the wrappers still exited 0, and the site's data
feeds silently stopped updating for two days while commits piled up locally.

`git pull --rebase --autostash` is NOT a safe fix here: this checkout routinely holds
other sessions' uncommitted edits (data/articles.json especially), and an unattended
autostash that fails to re-apply leaves conflict markers in their file.

So this script never uses the shared checkout's index or working tree to build the
commit. It fetches origin, builds a tree from origin's branch plus the given files
in a private temporary index, commits that tree on top of origin, and pushes it as a
fast-forward. If another push lands in between, it rebuilds on the new tip and tries
again. The local branch is then fast-forwarded only if git can do so without
overwriting uncommitted work; if not, that is logged and left alone.

Exit codes: 0 published or already current, 1 failure (so Task Scheduler shows it).
"""
import argparse
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_REPO = Path(__file__).resolve().parents[1]
RETRYABLE = ("non-fast-forward", "fetch first", "rejected", "cannot lock ref", "stale info")


def git(repo, *args, env=None, check=True):
    result = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, env=env)
    if check and result.returncode != 0:
        raise RuntimeError("git " + " ".join(args) + " failed: " + (result.stderr or result.stdout).strip())
    return result


def out(repo, *args, env=None):
    return git(repo, *args, env=env).stdout.strip()


def normalise(repo, path):
    full = (repo / path).resolve()
    try:
        rel = full.relative_to(repo.resolve())
    except ValueError:
        raise RuntimeError(path + " is outside the repository")
    if not full.is_file():
        raise RuntimeError(path + " does not exist")
    return rel.as_posix()


def build_commit(repo, base, paths, message):
    """Return the new commit id, or None when origin already holds these exact files."""
    with tempfile.TemporaryDirectory() as td:
        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(td, "index"))
        git(repo, "read-tree", base, env=env)
        for rel in paths:
            # hash-object applies the repo's clean filters (autocrlf), matching `git add`.
            blob = out(repo, "hash-object", "-w", "--path", rel, "--", rel)
            git(repo, "update-index", "--add", "--cacheinfo", "100644," + blob + "," + rel, env=env)
        tree = out(repo, "write-tree", env=env)
    if tree == out(repo, "rev-parse", base + "^{tree}"):
        return None
    return out(repo, "commit-tree", tree, "-p", base, "-m", message)


def fast_forward_local(repo, remote, branch, paths, log):
    """Best effort. Never forces, never stashes, never touches a rebase in progress."""
    git_dir = Path(out(repo, "rev-parse", "--absolute-git-dir"))
    if any((git_dir / p).exists() for p in ("rebase-merge", "rebase-apply", "MERGE_HEAD")):
        log("local branch not fast-forwarded: a rebase or merge is in progress")
        return
    if out(repo, "rev-parse", "--abbrev-ref", "HEAD") != branch:
        log("local branch not fast-forwarded: checkout is not on " + branch)
        return
    # Stage only the files just published, so their index entries match the new tip
    # and git accepts the fast-forward; nothing else in the index is touched.
    git(repo, "add", "--", *paths, check=False)
    r = git(repo, "merge", "--ff-only", "--quiet", remote + "/" + branch, check=False)
    if r.returncode != 0:
        log("local branch left behind (uncommitted work in the way or diverged): " + r.stderr.strip()[:300])
    else:
        log("local branch fast-forwarded to " + remote + "/" + branch)


def publish(repo, paths, message, remote="origin", branch="main", attempts=4, log=print):
    repo = Path(repo)
    rels = [normalise(repo, p) for p in paths]
    for attempt in range(1, attempts + 1):
        git(repo, "fetch", "--quiet", remote, branch)
        base = out(repo, "rev-parse", remote + "/" + branch)
        commit = build_commit(repo, base, rels, message)
        if commit is None:
            log("already current on " + remote + "/" + branch + " at " + base[:7] + ": nothing to publish")
            fast_forward_local(repo, remote, branch, rels, log)
            return base
        r = git(repo, "push", "--porcelain", remote, commit + ":refs/heads/" + branch, check=False)
        if r.returncode == 0:
            git(repo, "fetch", "--quiet", remote, branch)
            log("published " + commit[:7] + " (" + ", ".join(rels) + ") on top of " + base[:7])
            fast_forward_local(repo, remote, branch, rels, log)
            return commit
        detail = (r.stderr + r.stdout).strip()
        if attempt < attempts and any(k in detail for k in RETRYABLE):
            log("push raced another update (attempt " + str(attempt) + "), rebuilding on the new tip")
            time.sleep(3 * attempt)
            continue
        raise RuntimeError("push failed: " + detail[:500])
    raise RuntimeError("push kept racing other updates; gave up")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("paths", nargs="+", help="repo-relative files to publish, e.g. data/jobs.json")
    ap.add_argument("-m", "--message", required=True)
    ap.add_argument("--repo", default=str(DEFAULT_REPO))
    ap.add_argument("--remote", default="origin")
    ap.add_argument("--branch", default="main")
    args = ap.parse_args(argv)

    def log(msg):
        print(time.strftime("%Y-%m-%d %H:%M:%S") + " publish_data_file: " + msg, flush=True)

    try:
        publish(args.repo, args.paths, args.message, args.remote, args.branch, log=log)
    except Exception as exc:  # scheduled task: one clear line, nonzero exit
        log("FAILED: " + str(exc))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
