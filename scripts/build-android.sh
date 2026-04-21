#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_TYPE="${1:-debug}"

case "$BUILD_TYPE" in
  debug|release|bundle) ;;
  *)
    echo "Usage: $0 [debug|release|bundle]" >&2
    exit 1
    ;;
esac

find_android_sdk() {
  local candidates=(
    "${ANDROID_SDK_ROOT:-}"
    "${ANDROID_HOME:-}"
    "$HOME/Android/Sdk"
    "/root/Android/Sdk"
    "/opt/android-sdk"
    "/usr/lib/android-sdk"
  )

  local candidate=""
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -d "$candidate/platforms" && -d "$candidate/build-tools" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

find_java_home() {
  local candidates=(
    "${JAVA_HOME:-}"
    "/usr/lib/jvm/java-21-openjdk-amd64"
    "/usr/lib/jvm/java-21-openjdk"
  )

  local candidate=""
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -x "$candidate/bin/javac" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

resolve_apksigner() {
  if command -v apksigner >/dev/null 2>&1; then
    command -v apksigner
    return 0
  fi

  local found=""
  found="$(find "$ANDROID_SDK_ROOT/build-tools" -type f -name apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
  if [[ -n "$found" ]]; then
    printf '%s\n' "$found"
    return 0
  fi

  return 1
}

project_slug() {
  printf '%s' "$(basename "$ROOT_DIR")" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs 'a-z0-9' '-' \
    | sed 's/^-*//; s/-*$//'
}

default_signing_env_file() {
  local slug=""
  slug="$(project_slug)"
  printf '%s\n' "${HOME}/.config/android-skill/${slug}-signing.env"
}

load_signing_env() {
  local env_file="${1:?env file required}"
  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  # shellcheck disable=SC1090
  source "$env_file"

  export ANDROID_UPLOAD_KEYSTORE_PATH
  export ANDROID_UPLOAD_STORE_PASSWORD
  export ANDROID_UPLOAD_KEY_ALIAS
  export ANDROID_UPLOAD_KEY_PASSWORD
}

verify_artifact() {
  local artifact="${1:?artifact required}"
  if [[ "$artifact" == *.apk ]]; then
    local apksigner_bin=""
    apksigner_bin="$(resolve_apksigner || true)"
    if [[ -z "$apksigner_bin" ]]; then
      echo "Could not find apksigner for APK verification." >&2
      exit 1
    fi
    "$apksigner_bin" verify --print-certs "$artifact"
  else
    jarsigner -verify -verbose -certs "$artifact" >/dev/null
    echo "AAB signature verified with jarsigner."
  fi
}

with_temp_keystore_properties() {
  local properties_file="$ROOT_DIR/android/keystore.properties"

  if [[ -z "${ANDROID_UPLOAD_KEYSTORE_PATH:-}" || -z "${ANDROID_UPLOAD_STORE_PASSWORD:-}" || -z "${ANDROID_UPLOAD_KEY_ALIAS:-}" || -z "${ANDROID_UPLOAD_KEY_PASSWORD:-}" ]]; then
    echo "Release signing variables are incomplete." >&2
    exit 1
  fi

  cat > "$properties_file" <<EOF
storeFile=${ANDROID_UPLOAD_KEYSTORE_PATH}
storePassword=${ANDROID_UPLOAD_STORE_PASSWORD}
keyAlias=${ANDROID_UPLOAD_KEY_ALIAS}
keyPassword=${ANDROID_UPLOAD_KEY_PASSWORD}
EOF

  trap "rm -f '$properties_file'" EXIT
}

SDK_DIR="$(find_android_sdk || true)"
if [[ -z "$SDK_DIR" ]]; then
  echo "Android SDK not found. Set ANDROID_SDK_ROOT or install it in a standard location." >&2
  exit 1
fi

JAVA_HOME_DIR="$(find_java_home || true)"
if [[ -z "$JAVA_HOME_DIR" ]]; then
  echo "Java 21 not found. Install openjdk-21-jdk or set JAVA_HOME to a JDK 21 path." >&2
  exit 1
fi

export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export JAVA_HOME="$JAVA_HOME_DIR"
export PATH="$JAVA_HOME/bin:$PATH"

LOCK_FILE="$ROOT_DIR/android/.android-build.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another Android build is already running for $ROOT_DIR" >&2
  exit 1
fi

printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ROOT_DIR/android/local.properties"

echo "Using Android SDK: $SDK_DIR"
echo "Using Java: $JAVA_HOME"
echo "Building web bundle..."
(cd "$ROOT_DIR" && npm run build:web)
echo "Syncing Capacitor Android project..."
(cd "$ROOT_DIR" && npx cap sync android)

GRADLE_TASK="assembleDebug"
ARTIFACT_PATH="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

if [[ "$BUILD_TYPE" == "release" ]]; then
  GRADLE_TASK="assembleRelease"
  ARTIFACT_PATH="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
elif [[ "$BUILD_TYPE" == "bundle" ]]; then
  GRADLE_TASK="bundleRelease"
  ARTIFACT_PATH="$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
fi

if [[ "$BUILD_TYPE" != "debug" ]]; then
  SIGNING_ENV_FILE="${ANDROID_SIGNING_ENV_FILE:-$(default_signing_env_file)}"
  if ! load_signing_env "$SIGNING_ENV_FILE"; then
    echo "Signing env not found at $SIGNING_ENV_FILE." >&2
    echo "Use the /android skill or /root/.codex/skills/android/scripts/setup-release-signing.sh to create it." >&2
    exit 1
  fi
  with_temp_keystore_properties
fi

echo "Building Android $BUILD_TYPE artifact..."
(cd "$ROOT_DIR/android" && ./gradlew "$GRADLE_TASK")

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Build finished but expected artifact was not found at $ARTIFACT_PATH" >&2
  exit 1
fi

verify_artifact "$ARTIFACT_PATH"

if [[ "$BUILD_TYPE" == "release" ]]; then
  DIST_PATH="$ROOT_DIR/public/beastmode.apk"
  cp "$ARTIFACT_PATH" "$DIST_PATH"
  echo "Copied release APK to $DIST_PATH (baked into Docker image on next deploy)"
fi

echo
echo "Android artifact ready:"
echo "$ARTIFACT_PATH"
