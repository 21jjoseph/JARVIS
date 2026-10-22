#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/install-cloud-node.py
case "$(uname -m)" in
  x86_64) jarvis_node_arch=x64 ;;
  aarch64) jarvis_node_arch=arm64 ;;
  *) echo 'Unsupported cloud architecture' >&2; exit 1 ;;
esac
jarvis_node_version="$(cat .nvmrc)"
export PATH="$PWD/.cache/toolchains/node-v${jarvis_node_version}-linux-${jarvis_node_arch}/bin:$PATH"
export electron_config_cache="$PWD/.cache/electron"
export ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder"
if [[ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]]; then export NODE_USE_ENV_PROXY=1; fi
npm ci --no-audit
npm run check:compat
node scripts/setup-backend.mjs
npm run test:backend
npm test
npm run build
npm run voice:models
npm run voice:check
