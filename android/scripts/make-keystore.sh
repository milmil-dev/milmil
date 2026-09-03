#!/usr/bin/env bash
# Create the release signing keystore for the Android client and store it in
# GitHub Secrets for release-android.yml.
#
# Run once. The key is permanent: Android only installs an upgrade signed by
# the same key as the app already on the device, so losing this keystore
# means every user reinstalls. Back up the .jks and the passwords somewhere
# that outlives this machine.
#
# Usage: android/scripts/make-keystore.sh [repo]   (default: milmil-dev/milmil)
#   MILMIL_ANDROID_KEYSTORE_PASSWORD / MILMIL_ANDROID_KEY_PASSWORD are read
#   from the environment when set; otherwise a random password is generated
#   for both and printed at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="${1:-milmil-dev/milmil}"
KEYSTORE="$ROOT/android/release.jks"
ALIAS="milmil"

if [ -e "$KEYSTORE" ]; then
  echo "$KEYSTORE already exists — refusing to overwrite a signing key." >&2
  exit 1
fi

STORE_PASSWORD="${MILMIL_ANDROID_KEYSTORE_PASSWORD:-$(openssl rand -base64 24)}"
KEY_PASSWORD="${MILMIL_ANDROID_KEY_PASSWORD:-$STORE_PASSWORD}"

# 10000 days (~27 years): Play and Android both want a key valid past 2033.
keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storepass "$STORE_PASSWORD" \
  -alias "$ALIAS" -keypass "$KEY_PASSWORD" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=milmil, O=milmil-dev"

gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO" --body "$(base64 < "$KEYSTORE" | tr -d '\n')"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO" --body "$STORE_PASSWORD"
gh secret set ANDROID_KEY_ALIAS --repo "$REPO" --body "$ALIAS"
gh secret set ANDROID_KEY_PASSWORD --repo "$REPO" --body "$KEY_PASSWORD"

cat <<MSG

Keystore written to $KEYSTORE (gitignored) and the four secrets set on $REPO.
Back these up now — they cannot be recovered from GitHub:

  keystore:          $KEYSTORE
  keystore password: $STORE_PASSWORD
  key alias:         $ALIAS
  key password:      $KEY_PASSWORD

Local release build with the same key:

  export MILMIL_ANDROID_KEYSTORE=$KEYSTORE
  export MILMIL_ANDROID_KEYSTORE_PASSWORD='$STORE_PASSWORD'
  export MILMIL_ANDROID_KEY_ALIAS=$ALIAS
  export MILMIL_ANDROID_KEY_PASSWORD='$KEY_PASSWORD'
  cd android && ./gradlew assembleRelease
MSG
