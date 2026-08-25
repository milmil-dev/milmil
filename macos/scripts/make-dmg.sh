#!/bin/zsh
# Release build of milmil for macOS → ad-hoc signed app → DMG.
#
# No Developer Team yet: the app is signed with the ad-hoc identity ("-"),
# so Gatekeeper shows "unidentified developer" and users open it via
# right-click › Open (or `xattr -d com.apple.quarantine`). Swap
# CODE_SIGN_IDENTITY / add notarization here once an account exists.
#
# Usage: macos/scripts/make-dmg.sh [output-dir]   (run from the repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/macos/dist}"
DERIVED="$ROOT/macos/DerivedData-release"
VERSION="$(sed -n 's/.*MARKETING_VERSION: "\([^"]*\)".*/\1/p' "$ROOT/macos/project.yml" | head -1)"
DMG="$OUT/milmil-macos-${VERSION}.dmg"

cd "$ROOT/macos"
xcodegen generate --quiet
xcodebuild -project Milmil.xcodeproj -scheme Milmil \
  -destination 'platform=macOS,arch=arm64' -configuration Release \
  -derivedDataPath "$DERIVED" \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES CODE_SIGNING_ALLOWED=YES \
  -quiet build

APP="$DERIVED/Build/Products/Release/milmil.app"
[ -d "$APP" ] || { echo "app not found at $APP" >&2; exit 1; }

# Re-sign the whole bundle ad-hoc (embedded frameworks first via --deep) so
# the seal covers the MPVKit dylibs Xcode copied in.
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --deep --strict "$APP"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
mkdir -p "$OUT"
rm -f "$DMG"
hdiutil create -volname "milmil $VERSION" -srcfolder "$STAGE" -ov -format UDZO -quiet "$DMG"
echo "$DMG"
du -h "$DMG" | cut -f1
