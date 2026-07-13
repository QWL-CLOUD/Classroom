#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-.}"

for asset in assets/index-B58euost.js assets/index-e2xDAz5w.css manifest.webmanifest; do
  if [[ ! -f "$TARGET_DIR/$asset" ]]; then
    echo "Missing required existing file: $TARGET_DIR/$asset" >&2
    exit 1
  fi
done

if [[ -f "$TARGET_DIR/index.html" && ! -f "$TARGET_DIR/index.html.v18-backup" ]]; then
  cp "$TARGET_DIR/index.html" "$TARGET_DIR/index.html.v18-backup"
fi
cp "$SOURCE_DIR/index.html" "$TARGET_DIR/index.html"
rm -rf "$TARGET_DIR/v19"
cp -R "$SOURCE_DIR/v19" "$TARGET_DIR/v19"
cp "$SOURCE_DIR/CHANGELOG-v19.md" "$TARGET_DIR/CHANGELOG-v19.md"
cp "$SOURCE_DIR/VERSION-v19.txt" "$TARGET_DIR/VERSION-v19.txt"
cp "$SOURCE_DIR/manifest.webmanifest" "$TARGET_DIR/manifest.webmanifest"
cp "$SOURCE_DIR/version.json" "$TARGET_DIR/version.json"

echo "Classroom v19 patch copied to $TARGET_DIR"
echo "Existing assets and browser data were not removed."
