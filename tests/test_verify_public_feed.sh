#!/usr/bin/env bash
# Offline contract tests for the real verifier. All timed waits and network IO are replaced.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
export GITHUB_REPOSITORY=gaughanadrienne-gif/bcl-site-assets GITHUB_REF=refs/heads/main
export GITHUB_EVENT_NAME=push GITHUB_RUN_ATTEMPT=1
export GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa BCL_RENTAL_BEFORE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export BASH_ENV="$temp/fakes.sh"
cat > "$BASH_ENV" <<'FAKES'
sleep() { if [[ "$1" == 300 ]]; then touch "$RUNNER_TEMP/delayed"; fi; }
git() {
  if [[ "$1" == show && "$2" == "$GITHUB_SHA:data/rentals.json" ]]; then
    printf current
  elif [[ "$1" == ls-remote ]]; then
    if [[ "$SCENARIO" == moved && -f "$RUNNER_TEMP/rechecked" ]]; then
      printf '%s\trefs/heads/main\n' cccccccccccccccccccccccccccccccccccccccc
    else
      printf '%s\trefs/heads/main\n' "$GITHUB_SHA"
    fi
  else return 1; fi
}
curl() {
  local url="$4" bytes
  case "$url" in
    https://purge.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/rentals.json)
      echo request >> "$RUNNER_TEMP/purges"
      printf '{"status":"finished"}'
      return ;;
    https://raw.githubusercontent.com/*/"$BCL_RENTAL_BEFORE"/data/rentals.json)
      bytes=prior
      if [[ "$SCENARIO" == unchanged_in_push ]]; then bytes=current; fi ;;
    https://raw.githubusercontent.com/*/data/*.json)
      bytes=current
      if [[ "$SCENARIO" == superseded* && -f "$RUNNER_TEMP/delayed" ]]; then bytes=newer; fi ;;
    https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/data/*.json)
      bytes=prior
      case "$SCENARIO" in
        healthy) bytes=current ;;
        recover) if [[ -f "$RUNNER_TEMP/purges" ]]; then bytes=current; fi ;;
        propagated) if [[ -f "$RUNNER_TEMP/delayed" ]]; then bytes=current; fi ;;
        superseded) if [[ -f "$RUNNER_TEMP/delayed" ]]; then bytes=newer; fi ;;
        moved) if [[ -f "$RUNNER_TEMP/delayed" ]]; then touch "$RUNNER_TEMP/rechecked"; fi ;;
        read_error) return 22 ;;
        late_error) if [[ -f "$RUNNER_TEMP/delayed" ]]; then return 22; fi ;;
        unknown_bytes) bytes='unrelated bytes' ;;
      esac ;;
    *) echo "Unexpected URL: $url" >&2; return 1 ;;
  esac
  printf '%s' "$bytes" > "$6"
}
FAKES

check() {
  local scenario=$1 expect_status=$2 expect_purges=$3 file=${4:-rentals.json} status=0 actual=0
  export SCENARIO="$scenario" RUNNER_TEMP="$temp/case-$scenario-$file-$GITHUB_EVENT_NAME-$GITHUB_RUN_ATTEMPT"
  mkdir -p "$RUNNER_TEMP"
  bash "$root/scripts/verify_public_feed.sh" "$file" > "$RUNNER_TEMP/result" 2>&1 || status=$?
  if [[ -f "$RUNNER_TEMP/purges" ]]; then actual=$(wc -l < "$RUNNER_TEMP/purges"); fi
  if [[ "$status" != "$expect_status" || "$actual" -ne "$expect_purges" ]]; then
    cat "$RUNNER_TEMP/result" >&2
    echo "$scenario: unexpected exit $status / purges $actual" >&2
    exit 1
  fi
  echo "$scenario $file: exit $status, purges $actual"
}
check healthy 0 0
check recover 0 1
check propagated 0 0
check superseded 0 0
check superseded_but_stale 1 0
check unchanged_in_push 1 0
check moved 1 0
check read_error 1 0
check late_error 1 0
check unknown_bytes 1 0
check persistently_stale 1 1
check persistently_stale 1 0 events.json
check persistently_stale 1 0 articles-meta.json
GITHUB_EVENT_NAME=workflow_dispatch check persistently_stale 1 0
GITHUB_RUN_ATTEMPT=2 check persistently_stale 1 0
