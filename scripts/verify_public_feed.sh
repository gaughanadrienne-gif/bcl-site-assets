#!/usr/bin/env bash
set -euo pipefail

# The publisher owns the single purge. Inspect the same unmodified CDN URL the
# site requests, and compare with the latest released bytes on GitHub.
for file in "$@"; do
  case "$file" in
    articles-meta.json|events.json|rentals.json) ;;
    *) echo "Unknown public feed: $file" >&2; exit 2 ;;
  esac
  verified=false
  for attempt in 1 2 3 4 5; do
    revision=$(git ls-remote "https://github.com/${GITHUB_REPOSITORY}.git" refs/heads/main | cut -f1)
    if [[ "$revision" =~ ^[0-9a-f]{40}$ ]] &&
       curl -fsS --max-time 15 "https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${revision}/data/$file" -o "$RUNNER_TEMP/expected.json" &&
       curl -fsS --max-time 15 "https://cdn.jsdelivr.net/gh/${GITHUB_REPOSITORY}@main/data/$file" -o "$RUNNER_TEMP/served.json" &&
       cmp -s "$RUNNER_TEMP/expected.json" "$RUNNER_TEMP/served.json"; then
      verified=true
      break
    fi
    if [[ "$attempt" != 5 ]]; then sleep 8; fi
  done
  if [[ "$verified" != true ]]; then
    echo "::error::Public CDN bytes could not be verified for data/$file."
    exit 1
  fi
done
