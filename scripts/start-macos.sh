#!/usr/bin/env bash
# Run from any directory: this launcher always installs and starts in JARVIS.
# It keeps the pinned official Node toolchain inside this project; nvm is optional.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  ''|--setup-only) ;;
  *) printf 'Usage: bash scripts/start-macos.sh [--setup-only]\n' >&2; exit 1 ;;
esac
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != x86_64 ]]; then
  printf 'This launcher requires an Intel Mac. For Linux use scripts/setup-cloud.sh.\n' >&2
  exit 1
fi
jarvis_macos_version="$(/usr/bin/sw_vers -productVersion)"
if [[ "${jarvis_macos_version%%.*}" -lt 12 ]]; then
  printf 'JARVIS requires macOS Monterey 12 or later.\n' >&2
  exit 1
fi
if [[ ! -f package.json || ! -f package-lock.json || ! -f .nvmrc ]]; then
  printf 'Incomplete JARVIS download. Extract the complete project ZIP first.\n' >&2
  exit 1
fi
jarvis_node_version="$(cat .nvmrc)"
if ! [[ "$jarvis_node_version" =~ ^22\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Invalid Node 22 version pin in .nvmrc.\n' >&2
  exit 1
fi
jarvis_toolchains="$PWD/.cache/toolchains"
jarvis_archive="node-v${jarvis_node_version}-darwin-x64.tar.gz"
jarvis_node_dir="$jarvis_toolchains/node-v${jarvis_node_version}-darwin-x64"

if [[ ! -x "$jarvis_node_dir/bin/node" ]]; then
  mkdir -p "$jarvis_toolchains"
  jarvis_dist_url="https://nodejs.org/dist/v${jarvis_node_version}"
  printf 'Downloading official Node %s for Intel macOS…\n' "$jarvis_node_version"
  /usr/bin/curl --fail --location --retry 2 --connect-timeout 20 --max-time 300 \
    "$jarvis_dist_url/SHASUMS256.txt" -o "$jarvis_toolchains/SHASUMS256-${jarvis_node_version}.txt"
  /usr/bin/curl --fail --location --retry 2 --connect-timeout 20 --max-time 300 \
    "$jarvis_dist_url/$jarvis_archive" -o "$jarvis_toolchains/$jarvis_archive"
  jarvis_expected="$(/usr/bin/awk -v name="$jarvis_archive" '$2 == name {print $1}' "$jarvis_toolchains/SHASUMS256-${jarvis_node_version}.txt")"
  jarvis_actual="$(/usr/bin/shasum -a 256 "$jarvis_toolchains/$jarvis_archive" | /usr/bin/awk '{print $1}')"
  if [[ -z "$jarvis_expected" || "$jarvis_actual" != "$jarvis_expected" ]]; then
    printf 'Node checksum verification failed. The downloaded archive was not installed.\n' >&2
    exit 1
  fi
  /usr/bin/tar -xzf "$jarvis_toolchains/$jarvis_archive" -C "$jarvis_toolchains"
fi

export PATH="$jarvis_node_dir/bin:$PATH"
if [[ "$(node --version)" != "v$jarvis_node_version" ]]; then
  printf 'The pinned Node toolchain could not be activated.\n' >&2
  exit 1
fi
printf 'Using Node %s in %s\n' "$(node --version)" "$PWD"
# A matching fingerprint avoids reinstalling dependencies on every launch.
jarvis_dependency_stamp="$PWD/.cache/macos-dependencies.sha256"
jarvis_fingerprint="$(/usr/bin/shasum -a 256 package-lock.json .nvmrc | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"
jarvis_install=true
if [[ -f "$jarvis_dependency_stamp" && -x node_modules/.bin/electron && -f node_modules/electron/path.txt ]]; then
  if [[ "$(cat "$jarvis_dependency_stamp")" == "$jarvis_fingerprint" ]]; then jarvis_install=false; fi
fi
if [[ "$jarvis_install" == true ]]; then
  npm ci --no-audit
  printf '%s\n' "$jarvis_fingerprint" > "$jarvis_dependency_stamp"
fi
npm run check:compat
node scripts/setup-backend.mjs
if [[ "${1:-}" == --setup-only ]]; then
  printf 'Setup complete. Start with: bash scripts/start-macos.sh\n'
  exit 0
fi
exec npm run dev
