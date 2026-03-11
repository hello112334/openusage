#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

normalize_tag() {
  local input="${1:-}"
  [[ "$input" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Tag must match vX.Y.Z"
  printf '%s\n' "$input"
}

previous_release_tag() {
  local current_tag="$1"
  git tag --sort=-version:refname \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | awk -v current="$current_tag" '$0 != current { print; exit }'
}

write_commit_lines() {
  local current_tag="$1"
  local previous_tag="${2:-}"
  local found=1
  local range

  if [[ -n "$previous_tag" ]]; then
    range="${previous_tag}..${current_tag}"
  else
    range="$current_tag"
  fi

  while IFS=$'\t' read -r commit_sha commit_subject; do
    [[ -n "$commit_sha" ]] || continue
    [[ -n "$commit_subject" ]] || continue
    if [[ "$commit_subject" =~ ^chore\(release\):[[:space:]]v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      continue
    fi
    printf -- '- %s (%s)\n' "$commit_subject" "${commit_sha:0:7}"
    found=0
  done < <(git log --reverse --no-merges --format=$'%H\t%s' "$range")

  return "$found"
}

main() {
  require_cmd git

  local release_tag output_path version_note previous_tag
  release_tag="$(normalize_tag "${1:-}")"
  output_path="${2:-}"

  [[ -n "$output_path" ]] || fail "Output path is required"
  git rev-parse --verify "$release_tag^{tag}" >/dev/null 2>&1 || fail "Tag not found: $release_tag"

  version_note="version/$release_tag.md"
  previous_tag="$(previous_release_tag "$release_tag")"

  {
    if [[ -f "$version_note" ]]; then
      cat "$version_note"
      printf '\n'
    else
      printf '# %s\n\n' "$release_tag"
    fi

    printf '## What is changed\n\n'

    if write_commit_lines "$release_tag" "$previous_tag"; then
      :
    elif [[ -n "$previous_tag" ]]; then
      printf -- '- No non-release commits found between %s and %s.\n' "$previous_tag" "$release_tag"
    else
      printf -- '- First tagged release in this repository.\n'
    fi

    if [[ -n "$previous_tag" && -n "${GITHUB_REPOSITORY:-}" ]]; then
      printf '\nCompare: https://github.com/%s/compare/%s...%s\n' "$GITHUB_REPOSITORY" "$previous_tag" "$release_tag"
    fi
  } > "$output_path"
}

main "$@"
