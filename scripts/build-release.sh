#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Load .env (handles values with spaces)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Read key contents from file path
if [ -f "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$TAURI_SIGNING_PRIVATE_KEY")"
fi

# Clean previous bundle
rm -rf src-tauri/target/release/bundle

# Build
bun tauri build "$@"

echo ""
echo "✓ Build complete! Output:"
OUTPUTS=$(find src-tauri/target/release/bundle \
  \( -name '*.dmg' -o -name '*.app' -o -name '*.deb' -o -name '*.AppImage' -o -name '*.msi' -o -name '*.exe' \) \
  -print 2>/dev/null)

if [ -n "$OUTPUTS" ]; then
  printf '%s\n' "$OUTPUTS"
else
  echo "No known bundle artifacts found under src-tauri/target/release/bundle"
fi
