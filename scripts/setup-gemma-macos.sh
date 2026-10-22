#!/usr/bin/env bash
# Build the CPU engine on the user's actual Intel Mac; never download weights.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/start-macos.sh --setup-only
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
  printf 'Install Apple Command Line Tools with: xcode-select --install\nThen run this setup command again.\n' >&2
  exit 1
fi
jarvis_node_pin="$(cat .nvmrc)"
export PATH="$PWD/.cache/toolchains/node-v${jarvis_node_pin}-darwin-x64/bin:$PATH"
npm run engine:tools
npm run engine:build
printf '\nGemma engine built. No model weights were downloaded.\nRestart 21, open AI conversation → AI Intelligence, and choose an existing Gemma 4 GGUF or review an official release before downloading it.\n'
