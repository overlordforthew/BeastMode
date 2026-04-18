#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_TYPE="${1:-debug}"

case "$BUILD_TYPE" in
  debug|release) ;;
  *)
    echo "Usage: $0 [debug|release]" >&2
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

printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ROOT_DIR/android/local.properties"

echo "Using Android SDK: $SDK_DIR"
echo "Using Java: $JAVA_HOME"
echo "Syncing Capacitor Android project..."
(cd "$ROOT_DIR" && npx cap sync android)

GRADLE_TASK="assembleDebug"
APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

if [[ "$BUILD_TYPE" == "release" ]]; then
  GRADLE_TASK="assembleRelease"
  APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/release/app-release-unsigned.apk"
fi

echo "Building Android $BUILD_TYPE APK..."
(cd "$ROOT_DIR/android" && ./gradlew "$GRADLE_TASK")

if [[ ! -f "$APK_PATH" ]]; then
  echo "Build finished but expected APK was not found at $APK_PATH" >&2
  exit 1
fi

echo
echo "Android APK ready:"
echo "$APK_PATH"
