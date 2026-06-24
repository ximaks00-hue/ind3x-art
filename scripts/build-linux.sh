#!/usr/bin/env bash
# Build Linux AppImage for inD3X Art (must run on Linux).
#
# Usage:
#   ./scripts/build-linux.sh
#
# Output:
#   src-tauri/target/release/bundle/appimage/*.AppImage

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "AppImage bundles must be built on Linux (see docs/DISTRIBUTION.md)." >&2
  exit 1
fi

echo "Building AppImage release bundle..."
npm run build:appimage

bundle_root="src-tauri/target/release/bundle/appimage"
if [[ -d "$bundle_root" ]]; then
  echo ""
  echo "AppImage artifacts:"
  find "$bundle_root" -name '*.AppImage' -print -exec ls -lh {} \;
else
  echo "Bundle folder not found at $bundle_root" >&2
  exit 1
fi
