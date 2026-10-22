# 21 — Personal AI by 21Robotics

21 (spoken **Twenty One**, in Romanian and English) is the existing ferrofluid
desktop companion with local speech, approved desktop tools and a configurable
Local / Hybrid / Cloud AI system. This V3 update preserves the avatar and the
legacy JARVIS settings, application ID and integrations.

Target: **Intel x86_64, macOS Monterey 12, 16 GB RAM**. Electron **43.8.3**,
Node **22.23.4**, Python **3.12**. No macOS upgrade or nvm installation is needed.

## Download and launch on your Mac

[Download the V3 source ZIP](https://github.com/21jjoseph/JARVIS/archive/refs/tags/v3-update.zip),
then double-click the ZIP in Downloads to extract **JARVIS-3-update**. Quit the
older app. In Terminal paste:

```sh
cd "$HOME/Downloads/JARVIS-3-update" && bash scripts/start-macos.sh
```

GitHub strips the leading `v` from this tag's archive folder. If you used
**Code → Download ZIP** instead, the folder is **JARVIS-main**; use that name.
The launcher installs checksum-verified Node/Python locally and locked packages.
It preserves Conda, system tools and shell configuration. Repeat the same command
to launch again. `Ctrl+C` stops development; the tray menu also has **Quit 21**.
Do not run npm from your home directory. An npm update notice does not require
updating npm for this app.

The avatar, settings, clock/dashboard commands and approved tools work without an
AI key or language model. Double-click the avatar or press **⌘⇧J** to open the
dashboard. Drag it to move; size and position persist. The menu bar controls
visibility, dashboard, mute and quit. Closing the dashboard keeps the companion
available in the menu bar.

## Set up local Gemma 4

The CPU inference engine is built **on your actual Intel Mac**, with Metal and
Accelerate disabled, deployment target 12.0, context 4096 and one generation.
Install Apple's Command Line Tools if needed (`xcode-select --install`), then:

```sh
cd "$HOME/Downloads/JARVIS-3-update" && bash scripts/setup-gemma-macos.sh
```

This builds the pinned llama.cpp engine and **does not download model weights**.
Restart 21 afterward. Open **AI conversation → AI Intelligence**:

1. Keep **Local** mode and **llama.cpp · Gemma 4** selected.
2. Choose an existing Gemma 4 GGUF, or use **Discover official releases**.
3. Prefer **Gemma 4 E2B Instruct, QAT Q4_0** only when official Google release
   metadata confirms it. Review the actual revision, SHA256, size, model card
   and license before approving a download. E4B is optional; benchmark it first.
4. Click **Load model**. **Unload model** frees its RAM. Idle unload defaults
   to 600 seconds; click Load again before your next AI request.

A source ZIP cannot contain a Linux binary that runs on your Mac. This version
therefore requires the native engine build above. See [complete V3 setup and
verification](docs/v3-report.md) for official-source access, existing-file
verification, attached servers and diagnostic limitations.

Your existing Ollama connection remains available: choose **Ollama · existing
connection**, refresh, and select your installed model. The older optional
`scripts/start-local-ai-macos.sh` still starts the pinned Monterey-compatible
Ollama 0.5.7 / qwen2.5:3b setup. It explicitly downloads that older model when run;
it is a legacy option, not a Gemma substitution.

## Optional Gemini

In **AI Intelligence**, choose **Google Gemini → Configure key securely**.
On macOS a native hidden-input dialog keeps the key outside the renderer and
saves it through OS encryption. Never paste a key into chat or source files.
Other platforms can use a secure `GEMINI_API_KEY` environment binding.

Click **Test connection and models**. The preferences are `gemini-3.8-flash`,
`gemini-3.5-transcribe-live` and `gemini-3.8-flash-lite-tts`; these IDs are **not
claimed available** until your key's model discovery and a successful request
confirm them. If absent, select an available model explicitly. There is no silent
substitution. The existing OpenAI adapter remains available.

Enable cloud processing only if desired. Authorizing Hybrid selects **Hybrid**;
otherwise the default stays **Local**. Cloud mode requires per-message consent.
Private requests and explicit Local destinations never escalate. Recent context
and desktop tool results have separate sharing controls. Cloud API charges may
apply. Enter current prices to estimate spending; the warning is not a billing cap.

## Speech and avatar

Open **Audio & privacy** and install the approximately 268 MB local voice pack
once. Whisper, Piper and the keyword model then work offline. Choose Romanian or
English and click **Press to talk**, or enable wake mode and say **Yo Twenty One**,
**Hey Twenty One** or **Twenty One**. Your older custom wake phrase is retained.
Wait for “Da, te ascult” / “Yes, I am listening”, then speak and pause.

**Speech providers & calibration** adds Gemini Live STT, cloud TTS, voice, volume,
technical vocabulary and optional accent tests. Cloud speech requires explicit
speech consent, cloud enabled and Hybrid/Cloud mode; voice reasoning has a
separate transcript-sharing consent. Calibration is local by default, keeps the
original transcript and reports word error rate against the phrase/correction.
Corrections do not train a model. No microphone recording is saved to disk.

Generated PCM passes through the actual playback analyser to animate the
ferrofluid. **Stop / mute** and **Interrupt and talk** cancel stale work. Capture
ends when the owning window hides, minimizes or closes. Camera permissions are
denied. Native macOS microphone permission, Keychain, `/usr/bin/say`, actual
accent quality and Gemini speech still require target-machine/provider checks.

Whisper tiny can misrecognize short or noisy Romanian speech. Wake detection is
English and pronunciation-dependent; push-to-talk remains available. There is
no automatic acoustic barge-in. Cloud TTS failure falls back visibly to Piper.

## Desktop actions and context

Clock, greetings and opening the dashboard need no language model. Opening
Calculator, TextEdit, Finder or an installed CoppeliaSim, opening known folders,
reading a selected small UTF-8 file and finding filenames require a single-use
approval. No arbitrary shell or model-specified path is accepted. The real result
is displayed locally and can continue the selected model's answer. Sending a
result to cloud requires an additional checkbox.

Casual / Professional styles and recent session context are shared across
providers. Context is bounded and kept in memory; private turns are excluded from
later cloud context. There is no persistent long-term memory, printer control,
physical robotics, camera vision or remote-control feature in this update.

## Development and builds

With Node 22.23.4 active, from this repository:

```sh
npm ci
npm run backend:setup
npm run check:compat
npm test
npm run test:backend
npm run build
npm run voice:models
npm run voice:check
npm run test:e2e       # graphical display required
npm run dev
```

Linux cloud setup: `bash scripts/setup-cloud.sh`. Browser workbench:
`npm run dev:web` (no privileged desktop AI or voice APIs). The app starts and
stops its authenticated Python service; do not launch a second backend.

```sh
npm run engine:tools
npm run engine:build
npm run engine:benchmark -- --model "/absolute/path/to/Gemma-4-E2B.gguf"
```

Benchmarking is opt-in and downloads nothing. Stop the app's loaded model first.
Results go to `.cache/benchmarks/gemma4.json`; repeat `--model` for E4B comparison.
No Gemma benchmark results are claimed in this environment because no weights
were approved or installed.

On an Intel Mac, `npm run dist:mac` builds an x64 DMG. Building the native engine
first includes it in a same-platform package; no weights are bundled. Signing,
notarization and native Monterey execution need a Mac. Linux cross-packaging
checks the app/plist and Python Mach-O minimums but cannot execute the Mac app.

See [V3 delivery and remaining acceptance checks](docs/v3-report.md),
[Monterey dependency evidence](docs/compatibility.md),
[validation history](docs/validation.md), and [exact V3 file changes](docs/v3-files.md).
