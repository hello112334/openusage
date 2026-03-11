#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGE_JSON="package.json"
TAURI_CONF="src-tauri/tauri.conf.json"
CARGO_TOML="src-tauri/Cargo.toml"
CARGO_LOCK="src-tauri/Cargo.lock"
VERSION_DIR="version"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

assert_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Working tree must be clean before creating a release commit."
  fi
}

assert_synced_versions() {
  node <<'NODE'
const fs = require("fs");

const packageVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const tauriVersion = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoText = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoMatch = cargoText.match(/\[package\][\s\S]*?\nversion = "([^"]+)"/);

if (!cargoMatch) {
  console.error("Error: Could not read version from src-tauri/Cargo.toml");
  process.exit(1);
}

const cargoVersion = cargoMatch[1];
if (!(packageVersion === tauriVersion && tauriVersion === cargoVersion)) {
  console.error(
    `Error: Version files are out of sync: package.json=${packageVersion}, src-tauri/tauri.conf.json=${tauriVersion}, src-tauri/Cargo.toml=${cargoVersion}`,
  );
  process.exit(1);
}
NODE
}

normalize_version() {
  local input="${1#v}"
  [[ "$input" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version must match X.Y.Z or vX.Y.Z"
  printf 'v%s\n%s\n' "$input" "$input"
}

latest_release_tag() {
  git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true
}

bump_patch_version() {
  local version="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$version"
  printf '%s.%s.%s\n' "$major" "$minor" "$((patch + 1))"
}

resolve_target_version() {
  if [[ -n "${1:-}" ]]; then
    normalize_version "$1"
    return
  fi

  local latest_tag latest_version next_version
  latest_tag="$(latest_release_tag)"
  if [[ -n "$latest_tag" ]]; then
    latest_version="${latest_tag#v}"
  else
    latest_version="$(node -p "require('./package.json').version")"
  fi

  next_version="$(bump_patch_version "$latest_version")"
  printf 'v%s\n%s\n' "$next_version" "$next_version"
}

update_version_files() {
  local version="$1"

  node - "$version" <<'NODE'
const fs = require("fs");

const version = process.argv[2];
for (const path of ["package.json", "src-tauri/tauri.conf.json"]) {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  data.version = version;
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

const cargoPath = "src-tauri/Cargo.toml";
const cargoText = fs.readFileSync(cargoPath, "utf8");
const nextCargoText = cargoText.replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);

if (nextCargoText === cargoText) {
  console.error(`Error: Failed to update version in ${cargoPath}`);
  process.exit(1);
}

fs.writeFileSync(cargoPath, nextCargoText);

const lockPath = "src-tauri/Cargo.lock";
if (fs.existsSync(lockPath)) {
  const lockText = fs.readFileSync(lockPath, "utf8");
  const nextLockText = lockText.replace(
    /(\[\[package\]\]\nname = "openusage"\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );

  if (nextLockText === lockText) {
    console.error(`Error: Failed to update version in ${lockPath}`);
    process.exit(1);
  }

  fs.writeFileSync(lockPath, nextLockText);
}
NODE
}

create_version_note() {
  local tag="$1"
  local file_path="$VERSION_DIR/$tag.md"

  mkdir -p "$VERSION_DIR"
  [[ ! -e "$file_path" ]] || fail "Version note already exists: $file_path"

  cat > "$file_path" <<EOF
# $tag

- Date: $(date +%F)

## Notes

- Created by scripts/bump-version.sh
EOF
}

main() {
  require_cmd git
  require_cmd node

  git rev-parse --show-toplevel >/dev/null 2>&1 || fail "Not inside a git repository"
  git remote get-url origin >/dev/null 2>&1 || fail "Git remote 'origin' is required"
  assert_clean_worktree
  assert_synced_versions

  local current_branch
  current_branch="$(git branch --show-current)"
  [[ -n "$current_branch" ]] || fail "Cannot release from detached HEAD"

  mapfile -t version_parts < <(resolve_target_version "${1:-}")
  local tag_version="${version_parts[0]}"
  local plain_version="${version_parts[1]}"

  git rev-parse -q --verify "refs/tags/$tag_version" >/dev/null 2>&1 && fail "Tag already exists: $tag_version"

  update_version_files "$plain_version"
  create_version_note "$tag_version"

  git add "$PACKAGE_JSON" "$TAURI_CONF" "$CARGO_TOML" "$VERSION_DIR/$tag_version.md"
  if [[ -f "$CARGO_LOCK" ]]; then
    git add "$CARGO_LOCK"
  fi
  git commit -m "chore(release): $tag_version"
  git tag -a "$tag_version" -m "$tag_version"
  git push origin "$current_branch" "$tag_version"

  printf 'Released %s on branch %s\n' "$tag_version" "$current_branch"
}

main "$@"
