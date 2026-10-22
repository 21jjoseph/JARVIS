# 21 Master Update V3 — delivery and evidence

21 now has a managed Gemma/llama.cpp path, Gemini reasoning and speech adapters,
Local/Hybrid/Cloud routing, streamed conversation, bounded session context,
Casual/Professional style, explicit cloud privacy controls and accent calibration.
The existing Electron/React/Three.js avatar, Whisper/Piper/KWS, Ollama/OpenAI and
permission-controlled desktop tools are preserved. This report distinguishes
working integration code from live model and native Mac acceptance.

## 1. Exact source changes

See the [created/modified file manifest](v3-files.md). The baseline is commit
`48e7231c1cd64e729e21f3383dcfe4b8a2329880`. Generated weights, cache, dependencies,
keys, recordings and build outputs are excluded from source control.

## 2. Local Gemma setup

The app owns at most one llama-server subprocess, bound to an explicit loopback
HTTP port. A fresh API key is passed in the child's environment, never arguments.
Cloud keys are excluded from that child. Default CPU threads: 2 (configurable
1–8), context: 4096, parallel slots: 1, GPU layers: 0, batch: 128, microbatch: 64.
There is no idle inference. Idle unload defaults to 600 seconds and does not run
during an active request; load again explicitly afterward. The UI reports actual
loading/running state, PID resource measurements, startup errors and load time.
Concurrent loads, occupied ports and unsupported remote endpoints are rejected.
App/backend shutdown terminates its own child; attached servers remain external.

`configs/local-engine.json` pins source revision
`d77256999f211f8c0a5b12d13564f48d685b59e7` and archive SHA256
`50c25dadaf35c95d82c5c843c26444452482fc67d98ca70fcc71ea15215dc74c`.
The inspected upstream source implements Gemma 4 E2B/E4B. No alternate family is
selected behind the UI. Metal/Accelerate/OpenMP/OpenSSL/subprocess support are
disabled for the initial CPU build. Python HTTPS remains verified. A build receipt
records source revision, binary hash and platform. The engine is optimized for
the build machine's CPU; rebuild it when moving to a different CPU.

On the target Intel Mac, from the extracted project:

```sh
bash scripts/setup-gemma-macos.sh
```

It prepares the pinned toolchain and builds the engine, without fetching weights.
Apple Command Line Tools must be installed (`xcode-select --install`). The Mac
compiler target is x86_64/macOS 12.0; unguarded newer API use is a compilation
error, and Mach-O deployment metadata is checked before accepting the binary.
Restart the app after building so its backend finds the new executable.

## 3. Model download and existing-file import

In AI conversation → AI Intelligence, use **Choose existing GGUF**, or **Discover
official releases**. Discovery queries the real Hugging Face catalog with
`author=google`, searches Gemma 4 and lists actual GGUF E2B/E4B repository IDs;
no repository or release filename is guessed. If discovery returns no official
GGUF, report that limitation rather than installing a substitute.

Preview pins a real immutable revision, LFS SHA256, byte size, license and model
card. QAT Q4_0 is marked preferred only when confirmed by the actual release
repository/filename. Review those details and accept the license before clicking
Download. The directory is selectable with a native dialog. Space checks reserve
2 GiB beyond file size. Existing same-size/hash files skip download; conflicting
files are preserved. Downloads use a unique temporary file, bounded approved
size, HTTPS redirects restricted to the Hub/CDNs, final SHA verification and a
Gemma 4 architecture check before activation. Cancellation removes only the
installer's temporary file. No large weights were downloaded for this update.

Imported files are hashed and checked for GGUF header/architecture (`gemma4`).
That does **not** prove their source or tensor correctness; the UI labels source
and inference as unverified. Check a manual file against the publisher's SHA256.
The inference engine performs actual model loading validation.

Gated releases may require accepting Google's license in your Hugging Face
account. The current downloader does not collect a Hugging Face token. If a gated
download fails, download the approved official file through your account and
import it. Do not use an unverified mirror or bypass network policy.

## 4. Gemini credentials and model configuration

The requested IDs are preferences, not a claim of current API access:

| Function | Preferred ID | Required capability |
| --- | --- | --- |
| Reasoning | `gemini-3.8-flash` | `generateContent`, streaming request |
| Speech recognition | `gemini-3.5-transcribe-live` | `bidiGenerateContent` via Live WebSocket |
| Speech output | `gemini-3.8-flash-lite-tts` | `generateContent` with AUDIO response |

Use **Configure key securely** on macOS. A fixed native hidden-input dialog
returns the key only to Electron main. Main encrypts it with Electron safeStorage
(macOS Keychain backed) and stores only ciphertext, mode 0600. No plaintext key
input/getter exists in the renderer; legacy nonempty key-setting IPC is rejected.
Clear the saved credential with Remove saved key. Environment bindings take
precedence; removing the encrypted file does not remove an environment binding.
If OS encryption is unavailable, the app requires an external secure environment
binding; it does not downgrade to plaintext. On other platforms, use your secure
launcher/environment's `GEMINI_API_KEY` or `GOOGLE_API_KEY` binding. Do not put a
secret in `.env`, Git, shell-history commands or the chat.

**Test connection and models** performs real key-specific discovery at
`generativelanguage.googleapis.com`. Generation requires the exact selected ID
and advertised method. Requested unavailable IDs are not silently replaced.
Discovery alone does not prove language quality, audio support or successful
inference; those require a real request. Auth, rate limit, network, timeout and
empty/blocked outputs produce safe diagnostics without provider response bodies
or credentials. No automatic paid retry is scheduled.

REST generation follows the official Gemini content/function schemas. Streaming
preserves function-call thought signatures for tool-result continuation. Live STT
uses the documented `BidiGenerateContent` endpoint, input audio transcription,
ro/en language codes, custom vocabulary and PCM16 at 16 kHz. TTS requests AUDIO
with a selected prebuilt voice (Charon initially), then validates/decodes actual
PCM/WAV. Official SDK source schemas were inspected; installed model access and
these preferred model IDs remain unverified without credentials.

## 5. Launch, start/stop and routing

After downloading the versioned ZIP and extracting it in Downloads:

```sh
cd "$HOME/Downloads/JARVIS-3-update" && bash scripts/start-macos.sh
```

The app launches the authenticated Python service itself. Do not start a second
backend. Use **Load model** / **Unload model** to start/stop owned inference.
`Ctrl+C` stops development; **Quit 21** stops the app/backend/owned model. An
externally attached llama-server remains your responsibility. Local endpoints
must be loopback HTTP with a port and no credentials/path/query/fragment.

Local is the safe initial mode. Hybrid is selected only after enabling cloud and
authorizing non-private Hybrid messages. Cloud mode or an explicit Cloud message
requires per-turn consent; speech reasoning has a separate persistent opt-in.
Local mode, an explicit Local destination and private turns never escalate.

The centralized policy considers user mode/overrides, privacy and consent,
provider/model health, structural complexity (length, question/newline count,
recent context), measured previous latency and the configured spending warning.
Routine/uncertain requests prefer local. If prior local completion exceeded 15 s
and an actually measured cloud completion was faster, authorized Hybrid can use
cloud. Reaching a configured spending warning makes automatic routing prefer an
available local provider; it is not a billing cap. The reason/provider/model are
shown. One authorized fallback is allowed; partial provider replies are never
blended. Missing providers leave the desktop and bounded commands functional.

Context is in-memory, at most ten sessions and eight recent messages per session;
roughly 3,000 history characters are supplied per generation, not a claimed exact
token count. The llama-server enforces 4096 tokens including prompt/template/tools.
Long or heavily tokenized inputs may hit that limit and return a diagnostic.
Cloud history needs both the setting and per-request sharing consent. Private
turns stay excluded even if later public turns allow history sharing. No memory
database or invented persistent memory is created.

Provider output is streamed to Electron/React when supported (llama, Gemini,
OpenAI). Legacy Ollama remains an explicitly labelled non-streaming adapter.
AI is one request at a time, including tool follow-ups; cancellation and deadlines
release it. TTFT, total time, available usage and derived throughput are measured.
Reasoning cost estimates use user-entered current prices and token counts,
including completed tool follow-ups and reported reasoning/thought tokens. Cached-token discounts and provider-specific pricing tiers are not inferred. Zero price means unknown. Estimates exclude
speech and failed/interrupted requests and are never provider billing caps.

## 6. Voice, identity and desktop permissions

The canonical identity is 21, spoken **Twenty One** in ro/en. Casual and
Professional share that identity and safety prompt. Pronunciation normalization
matches identity contexts and preserves engineering quantities such as 21 mm.
KWS supports Yo Twenty One, Hey Twenty One and Twenty One plus the existing saved
wake phrase. Raw transcripts are retained in memory separately from parser text.

Local Whisper/Piper/KWS remain independent of the large model. Gemini STT/TTS
require cloud enabled, Hybrid/Cloud mode and explicit speech consent. Speech
reasoning requires its separate transcript opt-in. A private text request is not
speech capture. Calibration defaults to local; uploading the next calibration
sample needs a separate one-use UI choice plus speech consent. Vocabulary hints
apply to Gemini only; local Whisper does not claim adaptation. Original and manual
corrected text remain distinct; WER uses real comparison, without retraining.

STT can display actual Live partials; finalization failures use the retained
bounded utterance for local Whisper fallback. TTS failure visibly uses local
Piper, with a potentially different voice. PCM playback, speech speed and volume
feed the actual analyser/ferrofluid signal, not a timer-generated amplitude.
TTS currently waits for a bounded utterance before playback; incremental streamed TTS playback is not claimed. One playback at a time; stop/interrupt/hide/minimize/quit cancel and release audio.
WAKE_DETECTED, TRANSCRIBING and MUTED join the existing state reducer/profiles.
Wake latency is the measured processing time of the detecting audio packet,
not an inferred acoustic onset latency. STT finalization, TTS readiness, AI TTFT
and completed turn duration are measured separately; no performance is promised.

The permission controller still validates every tool twice, binds an approval to
the window/arguments, expires it in 60 s and consumes it once. CoppeliaSim launch
is a fixed macOS application name, with successful OS request reported only after
`open` returns; no simulation/hardware control is implied. Existing file/folder/
system/app tools remain. Actual results display locally and can continue local
AI. Cloud continuation needs separate result-sharing approval and cloud still
enabled; missing/failed follow-up never erases the actual local result. Audits
contain tool/outcome/time only. No arbitrary shell, model path or remote control.

## 7. Benchmark utility and actual results

```sh
npm run engine:benchmark -- --model "/absolute/path/to/Gemma-4-E2B.gguf"
# Optional later comparison, same prompts:
npm run engine:benchmark -- --model "/path/E2B.gguf" --model "/path/E4B.gguf"
```

Use the pinned Node 22 environment from the project and stop the app's loaded
model first. Override `--binary`, `--threads`, `--endpoint` or `--output` if needed.
The utility uses real generation for Romanian greeting, mixed-language,
robotics, structured intent and summarization prompts. It measures load, TTFT,
latency, available output-token throughput and sampled process RAM/CPU. It records
responses for human language/intent review. JSON is written under `.cache/benchmarks`.
It never downloads weights. CPU readings are `ps` lifetime process percentages;
RAM is sampled RSS, not total system memory or an instantaneous hardware counter.
Temperature and human quality reviews remain null unless separately collected.

**No E2B/E4B inference measurements are available.** No weights were approved or
installed. E2B remains the conservative starting recommendation for a 16 GB Intel
Mac; no measured speed or quality advantage over E4B is asserted.

## 8. Verification results (Linux x86_64)

| Check | Result / boundary |
| --- | --- |
| Node/Electron/Monterey configuration | Passed; Node 22.23.4, Electron 43.8.3, min OS 12, x64 |
| TypeScript and production build | Passed; normal bundle-size advisory remains |
| Vitest | 78 passed: contracts, settings migration/persistence, identity, calibration, PCM, stale speech cancellation, avatar states, permissions |
| Python | 27 passed: original v1 regressions plus v2 stream/cancel, auth/privacy, history, fallback, measured policy, tool validation, model integrity/lifecycle, Gemini speech fixtures |
| Local speech models | 16 actual Piper/Whisper/KWS checks passed on generated en/ro speech, including all three Twenty One phrases and legacy Jarvis |
| Source Electron | Five integration suites passed: avatar/IPC/audio/persistence; local voice; real Python with Ollama HTTP fixture; spoken AI/tools/stop; llama SSE fixture and key boundary |
| llama.cpp | Hash-verified source CPU build and `--version` passed on Linux; Gemma inference unverified |
| Mac Python bundle | 13 Intel native binaries audited, maximum deployment 10.15; new websockets speedups 10.13 |
| Mac engine build tools | Five Intel slices audited, maximum deployment 10.10 |
| Packaged Linux and Intel Mac app | See final packaging verification entry in validation.md |
| Live Gemini / real Gemma / native Monterey | Unverified; missing key/approved model/target hardware |

Protocol fixtures exercise the actual adapters, Python process, HTTP/SSE and
Electron flow but are not a claim of Gemini/Gemma intelligence. Synthetic speech
is not a Romanian-accent or physical microphone acceptance test.

## 9. Remaining user setup and acceptance

This cloud environment initially denied `huggingface.co` and `ai.google.dev`
through the network proxy (403). No Gemini key or HF token was configured. The
required API/model domains and Gemini credential requirement were saved to the
environment draft; this does not apply or publish settings. Review/save the
settings and publish the environment if you want live validation here. On the
Mac, use the native secure key dialog and the approved model workflow above.

Acceptance criteria 1–3, 7–10 and 12–17 have implementation/fixture or local-speech
coverage; provider-dependent claims within them still need a real model. Criteria
4–6 and 11 require actual Gemma/Gemini access. Criterion 18 has pins, binary
metadata and cross-package checks, but native execution is unverified. The user's
prior Phase 1 Monterey avatar/microphone success is preserved history and does
not certify this update's new inference/Keychain/speech paths.

Required target checks: compile/load E2B, run the benchmark, check physical
microphone/accent/calibration, verify each requested Gemini ID and a live reasoning,
Live STT and TTS request, confirm Keychain/permission prompts, app focus, smooth
avatar, cancellation, offline operation and unload/quit behavior. Mac DMG signing/
notarization, Windows, thermal quality and real API billing are unverified.

## 10. Recommended next phase

Complete native Monterey acceptance and E2B measurements first. Compare E4B only
after E2B is usable. Then consider user-controlled persistent memory with explicit
cloud retrieval consent, followed by simulation-only CoppeliaSim integration.
Physical printers/robotics, iOS/Watch, vision, remote control and autonomous
long-running agents remain deferred as requested.

## Advanced foreground inference commands

The dashboard Load/Unload buttons are recommended. For an external foreground
server, configure `LLAMA_API_KEY` as a secret environment binding shared by your
server and 21 launcher, and optionally `LLAMA_ENDPOINT` (default
`http://127.0.0.1:8080`). These are read only by trusted processes. Set the app's
Local endpoint to match; the key is never returned to the renderer. Do not put the
actual key in command arguments or shell history. With that binding active:

```sh
.cache/local-engine/build/bin/llama-server \
  -m "/absolute/path/to/Gemma-4-E2B.gguf" \
  --host 127.0.0.1 --port 8080 --ctx-size 4096 --parallel 1 \
  --batch-size 128 --ubatch-size 64 --threads 2 --threads-batch 2 \
  --n-gpu-layers 0 --jinja --alias gemma-4-local --no-webui
```

`LLAMA_API_KEY` is the engine's supported environment variable; the executable
reads it without a command-line secret. **Ctrl+C** in that terminal stops this
external server. Launch 21 separately with the same binding and use the llama.cpp
connection; do not also press Load while that port is occupied. Unload/quit in 21
stops only app-owned inference. Without a configured key, llama-server permits
unauthenticated loopback access; use the app-owned engine to get authentication
automatically. Never change the bind address to an external interface.
