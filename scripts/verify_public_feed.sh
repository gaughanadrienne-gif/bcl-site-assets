#!/usr/bin/env bash
set -euo pipefail

raw="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}"
cdn="https://cdn.jsdelivr.net/gh/${GITHUB_REPOSITORY}@main"
expected="$RUNNER_TEMP/expected.json"
served="$RUNNER_TEMP/served.json"

read_once() {
  local file=$1
  mismatch=false
  revision=$(git ls-remote "https://github.com/${GITHUB_REPOSITORY}.git" refs/heads/main | cut -f1) || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  curl -fsS --max-time 15 "$raw/$revision/data/$file" -o "$expected" || return 1
  curl -fsS --max-time 15 "$cdn/data/$file" -o "$served" || return 1
  if cmp -s "$expected" "$served"; then return 0; fi
  mismatch=true
  echo "Mismatch at $revision for $file (SHA-256 expected, served):"
  sha256sum "$expected" "$served"
  return 1
}

verify() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if read_once "$1"; then return 0; fi
    if [[ "$attempt" != 5 ]]; then sleep 8; fi
  done
  return 1
}

prior_version_still_served() {
  [[ "$mismatch" == true ]] &&
    cmp -s "$served" "$RUNNER_TEMP/rentals-before.json" &&
    cmp -s "$expected" "$RUNNER_TEMP/rentals-candidate.json"
}

recover_rentals() {
  # The publisher keeps its ordinary purge. Only a first-attempt main push
  # whose rental file was changed may recover an observed previous version.
  [[ "$GITHUB_REPOSITORY" == "gaughanadrienne-gif/bcl-site-assets" &&
     "${GITHUB_EVENT_NAME:-}" == push && "${GITHUB_REF:-}" == refs/heads/main &&
     "${GITHUB_RUN_ATTEMPT:-}" == 1 && "${BCL_RENTAL_BEFORE:-}" =~ ^[0-9a-f]{40}$ &&
     "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ && "$mismatch" == true ]] || return 1
  git show "$GITHUB_SHA:data/rentals.json" > "$RUNNER_TEMP/rentals-candidate.json" || return 1
  curl -fsS --max-time 15 "$raw/$BCL_RENTAL_BEFORE/data/rentals.json" -o "$RUNNER_TEMP/rentals-before.json" || return 1
  prior_version_still_served || return 1

  echo "Public rentals still match the previous release. Rechecking after the ordinary publisher purge."
  sleep 300
  if read_once rentals.json; then return 0; fi
  if [[ "$mismatch" == true ]] && ! cmp -s "$expected" "$RUNNER_TEMP/rentals-candidate.json"; then
    echo "Rental release superseded. Checking current delivery without a recovery purge."
    verify rentals.json
    return $?
  fi
  prior_version_still_served || return 1
  # Catch a newer release that arrived while the CDN read was in flight.
  local current
  current=$(git ls-remote "https://github.com/${GITHUB_REPOSITORY}.git" refs/heads/main | cut -f1) || return 1
  if [[ "$current" != "$revision" ]]; then
    verify rentals.json
    return $?
  fi
  echo "Recovering the stale rentals.json edge once for verified revision $revision."
  curl -fsS --max-time 20 "https://purge.jsdelivr.net/gh/${GITHUB_REPOSITORY}@main/data/rentals.json" ||
    echo "Purge receipt unavailable. Checking actual public delivery."
  echo
  verify rentals.json
}

for file in "$@"; do
  case "$file" in
    articles-meta.json|events.json|rentals.json) ;;
    *) echo "Unknown public feed: $file" >&2; exit 2 ;;
  esac
  if verify "$file"; then continue; fi
  if [[ "$file" == rentals.json ]] && recover_rentals; then continue; fi
  echo "::error::Public CDN bytes could not be verified for data/$file."
  exit 1
done
