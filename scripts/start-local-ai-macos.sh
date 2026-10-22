#!/usr/bin/env bash
# Optional, explicit download: pinned local server (~54 MB) + Qwen 2.5 3B (~1.9 GB).
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != x86_64 ]]; then
  printf 'This launcher is for Intel macOS Monterey 12 or later.\n' >&2; exit 1
fi
jarvis_os_version="$(/usr/bin/sw_vers -productVersion)"
if [[ "${jarvis_os_version%%.*}" -lt 12 ]]; then printf 'macOS 12 or later required.\n' >&2; exit 1; fi
jarvis_ollama_dir="$PWD/.cache/toolchains/ollama-0.5.7"
jarvis_ollama="$jarvis_ollama_dir/ollama"
jarvis_expected=abfee5c50a0ca0c5e25b6933ff27d9f5a98310b099dac65bb774f8bd015bf555
mkdir -p "$jarvis_ollama_dir"
jarvis_valid=false
if [[ -f "$jarvis_ollama" ]]; then
  jarvis_actual="$(/usr/bin/shasum -a 256 "$jarvis_ollama" | /usr/bin/awk '{print $1}')"
  if [[ "$jarvis_actual" == "$jarvis_expected" ]]; then jarvis_valid=true; fi
fi
if [[ "$jarvis_valid" != true ]]; then
  printf 'Downloading Monterey-compatible Ollama CLI 0.5.7 (54 MB)…\n'
  /usr/bin/curl --fail --location --retry 2 --connect-timeout 20 --max-time 300 \
    https://github.com/ollama/ollama/releases/download/v0.5.7/ollama-darwin -o "$jarvis_ollama.download"
  jarvis_actual="$(/usr/bin/shasum -a 256 "$jarvis_ollama.download" | /usr/bin/awk '{print $1}')"
  if [[ "$jarvis_actual" != "$jarvis_expected" ]]; then printf 'Ollama checksum failed. Installation stopped.\n' >&2; exit 1; fi
  mv "$jarvis_ollama.download" "$jarvis_ollama"
  chmod 755 "$jarvis_ollama"
fi
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS="$PWD/.cache/ollama-models"
export OLLAMA_NOHISTORY=true
export OLLAMA_CONTEXT_LENGTH=4096
export OLLAMA_NUM_PARALLEL=1
mkdir -p .cache/ollama-models .cache/ollama-logs
if /usr/bin/curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null; then
  printf 'An Ollama server is already running. Use its installed model in JARVIS or stop it before running this launcher.\n'; exit 0
fi
"$jarvis_ollama" serve > .cache/ollama-logs/server.log 2>&1 &
jarvis_server_pid=$!
trap 'kill "$jarvis_server_pid" 2>/dev/null || true' EXIT
jarvis_ready=false
for jarvis_attempt in {1..60}; do
  if ! kill -0 "$jarvis_server_pid" 2>/dev/null; then printf 'Local AI server failed. Check .cache/ollama-logs/server.log.\n' >&2; exit 1; fi
  if /usr/bin/curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null; then jarvis_ready=true; break; fi
  sleep 1
done
if [[ "$jarvis_ready" != true ]]; then printf 'Local AI startup timed out.\n' >&2; exit 1; fi
printf 'Preparing qwen2.5:3b (~1.9 GB on first use). Keep this window open.\n'
"$jarvis_ollama" pull qwen2.5:3b
printf '\nLocal AI is ready. In JARVIS, open AI conversation, refresh, and select qwen2.5:3b.\nKeep this terminal open; Ctrl+C stops this server.\n'
wait "$jarvis_server_pid"
