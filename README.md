# JARVIS

**21Robotics · Personal hybrid AI assistant · Phase 3**

A local desktop companion built around an animated, metallic ferrofluid avatar.
The ferrofluid avatar supports local Romanian/English voice, optional local or
cloud AI, text conversation and approved desktop actions. AI provider selection
is explicit; local commands continue to work without an AI connection. Memory,
vision and robotics remain later phases. Microphone audio stays on the device.

## Monterey / Intel quick start

Requires **macOS Monterey 12 or later on Intel x86_64**. The launcher downloads
the official **Node 22.23.4 Intel build** into this project's `.cache/` directory,
verifies its SHA256, and installs the locked dependencies. **nvm is not required**.
The launcher also prepares project-local **Python 3.12**. An account or API key
is optional. Internet is needed for setup.

First [download the Phase 3 ZIP from GitHub](https://github.com/21jjoseph/JARVIS/archive/refs/tags/phase-3.zip)
and extract it on your Mac. Sign in to GitHub if requested. The GitHub ZIP
contains a top-level `JARVIS-phase-3` folder. Quit the older JARVIS before starting
this version. Extract the ZIP in Downloads, then run:

```sh
cd "$HOME/Downloads/JARVIS-phase-3" && bash scripts/start-macos.sh
```

The `&&` stops the command if the directory is missing, so npm cannot accidentally
run against a different project in your home folder. The launcher uses its own
location as the working directory and does not change your Conda installation,
system Node or shell startup files. Initial dependency downloads may take a few
minutes. Repeat the same command to launch again.

If you have the separate `JARVIS-source.zip` bundle instead, its folder is named
`JARVIS`; use that folder name in the command. Files created in a cloud workspace
are not automatically copied to your computer.

GitHub's **Code → Download ZIP** button for `main` creates a `JARVIS-main` folder;
use that folder name for that download. The versioned Phase 3 ZIP keeps your
older source folder separate.

If you already have **nvm installed** and prefer to manage Node yourself, use the
following from the extracted JARVIS folder instead:

```sh
nvm install
nvm use
npm ci
npm run backend:setup
npm run dev
```

If you use another Node version manager, select Node 22.23.4 before `npm ci`.
The root postinstall script explicitly installs Electron with checksum and TLS
verification. Package downloads are cached in `.cache/`.

If Terminal reports `Missing script: dev`, check `pwd`: you are probably outside
the JARVIS folder. If `nvm` is not found, use the launcher above. The npm update
notice is informational and does not require updating npm for this project.

The transparent avatar appears near the lower-right corner of the desktop.

- **Drag the avatar** to move it. Its size and position persist across restarts.
- **Click** to start a voice turn after model setup (a short delay distinguishes double-click).
- **Double-click**, use the dashboard button, or press **⌘⇧J** to open the control room.
- The **menu-bar/tray menu** shows/hides the avatar, stops audio, opens the dashboard or quits.
- Closing the dashboard leaves the companion in the menu bar. Use **Quit JARVIS** to exit.
- Click-through outside the circular interaction region is enabled by default on
  macOS and Windows. Linux uses normal hit testing.

macOS asks for microphone access when you enable it. If blocked, open
**System Preferences → Security & Privacy → Privacy → Microphone**, allow the app
or development host shown there, then restart it. Camera and screen permissions
are denied in this version.

## Use Phase 2 voice

1. Open the dashboard and select **Audio & privacy** (Romanian: **Audio & confidențialitate**).
2. Click **Download voice models / Descarcă modelele vocale** once. The approximately
   **268 MB** download contains local Whisper, keyword and Romanian/English Piper
   models. SHA256 checks run before files are used. Installed data occupies about
   422 MiB. Microphone audio and transcripts are never sent with downloads.
3. Select Romanian or English, then click **Press to talk / Apasă și vorbește**.
   Speak a command and pause. Local VAD ends the utterance and JARVIS replies.
4. Or enable **“Jarvis”**, say the wake phrase, wait for **“Da, te ascult” / “Yes,
   I am listening”**, then speak. The microphone stays active locally while armed.
5. **Stop / mute** ends capture. **Interrupt and talk** cancels a reply/inference
   and starts a new turn. Closing, hiding or minimizing the owning window ends
   the session. Voice never arms automatically at launch.

Try **“Cât este ceasul?”**, **“Deschide panoul de control”**, **“Salut”**, or
**“What time is it?”**, **“Open the control room”**, **“Hello”** in English.
These bounded commands work offline. Other requests use the selected local
Ollama model when connected. The latest recognized phrase and reply remain in
memory only. Voice always uses local routing.

Manual microphone/amplitude testing remains available in the audio panel. Wake
phrase, language, microphone device, rate and voice provider are configurable.
Piper supplies portable local Mihai/Amy voices. The optional **macOS system voice**
provider uses installed voices through `/usr/bin/say` and measures actual WAV
playback through Web Audio; that provider still needs a native Mac check.

Whisper tiny can make transcription mistakes, especially on short/noisy Romanian
phrases. The keyword model is English; pronunciation affects detection. Use
push-to-talk when needed. Automatic acoustic barge-in is not enabled; use the
interruption button. Recognition is utterance-based, without partial token streaming.

## Use Phase 3 AI

Open **AI conversation / Conversație AI**. Try **Show system info** and approve
it once. **Open calculator**, **Open downloads**, **Read a file**, and **Find
files named report** work without an AI model and require approval. Results stay
on your device.

For general local conversation, open a second Terminal window and run:

```sh
cd "$HOME/Downloads/JARVIS-phase-3" && bash scripts/start-local-ai-macos.sh
```

This optional command downloads a Monterey-compatible pinned Ollama CLI and
**qwen2.5:3b** (about 1.9 GB). Keep the terminal open, choose **Refresh connection**
in JARVIS and select **qwen2.5:3b**. Prefer 8 GB RAM or more. Intel CPU responses
can take time. Do not install the latest Ollama blindly: a checked newer build
requires macOS 13.

Alternatively, save your own OpenAI API key in **AI connections**, choose
**OpenAI cloud**, and approve sending each message. Keys use OS encryption.
There is no automatic cloud fallback and no automatic sending of files or past
messages. See [AI setup, permissions and limitations](docs/ai.md).

## What works

- Transparent, frameless, optionally always-on-top Electron overlay, bounded
  multi-display positioning, saved size/position, tray and keyboard controls.
- Three.js / GLSL ferrofluid surface with moving magnetic spikes, liquid ridges,
  studio reflections, dark metal and customizable accent lighting.
- Eight smoothly interpolated states: idle, listening, thinking, speaking,
  executing, warning, error and offline, controlled by a central reducer.
- Local microphone amplitude analysis with explicit activation and device selection.
  Audio is never recorded, uploaded, or monitored back to speakers.
- Local audio-file playback drives the speaking state from its actual signal.
  A labelled 8-second audible test tone exercises the same analyser path.
- Romanian/English control room, state previews, input meter and preferences.
  Preview states do not imply active AI or microphone capture.
- Adaptive geometry/DPR, 30 FPS idle/eco, up to 60 FPS active, 15 FPS reduced motion,
  and rendering suspension while hidden. Actual FPS depends on hardware.
- Context isolation, sandboxed renderers, no renderer Node access, restricted
  navigation, validated IPC and main-process audio ownership.
- Atomic settings persistence, corrupt-file preservation and capture release
  on window hide/minimize/close or application quit.

Launch at login works in **packaged macOS/Windows apps**. Development builds
disable the setting so the login item never points at generic Electron.

## Development and verification

```sh
npm run check:compat   # pins, lockfile, Monterey/x64 configuration
npm run typecheck
npm test              # state, validation, settings, audio, permissions and files
npm run backend:setup # Python 3.12 + hash-locked dependencies
npm run test:backend  # providers, authentication, privacy and cancellation
npm run build         # strict checks + renderer and Electron production bundles
npm run voice:models  # verified local models; also available as a dashboard button
npm run voice:check   # seven actual keyword / STT / TTS checks; generates test WAVs
npm start             # built desktop app
npm run test:e2e      # real Electron test; needs a graphical display
```

`npm run dev` starts Vite and Electron. React changes hot reload; restart after
Electron, preload or shared IPC changes. Ctrl+C stops both processes.
`npm run dev:web` starts a local browser workbench, labelled as having no desktop
APIs or persistent settings.

The Electron test uses a prerecorded WAV as a synthetic microphone and
SwiftShader. It verifies the capture/analyser/IPC path, not physical hardware or
macOS permissions. Linux containers without user namespaces may run it with
`JARVIS_TEST_NO_SANDBOX=1`; this flag is confined to the test launcher. Normal
development and packaged apps retain Electron's sandbox.

See [Monterey compatibility](docs/compatibility.md) and
[validation results and native checks](docs/validation.md).

## Build an Intel Mac application

On the Intel Mac, with Node 22 selected:

```sh
npm ci
npm run backend:setup
npm run dist:mac
```

This builds an **x64 DMG** with `LSMinimumSystemVersion=12.0`. `npm run package`
builds an unpacked app. Use macOS for DMG creation and Apple signing/notarization.
Signing identities belong in secure build settings, never source control.

Cloud verification produced an unsigned app at `release/mac/JARVIS.app`.
It was cross-packaged on Linux and cannot be executed there. The Monterey
launch, transparency, microphone permissions, click-through, menu bar and login
item still need a native Mac check. Windows has a build configuration
(`npm run dist:win`) but has not been tested on a Windows host.

## Structure

```text
apps/desktop/
  electron/       Main process, preload, origin policy, atomic settings store
  src/
    avatar/       Geometry, GLSL and animation profiles
    components/   Overlay and interface icons
    dashboard/    Control room and preferences
    hooks/        Runtime subscriptions and audio lifecycle
    services/     Web Audio, bridge and language strings
shared/contracts/ Typed IPC, settings validation and state machine
scripts/          Build, launchers, setup and compatibility audits
tests/unit/       Logic and persistence tests
tests/e2e/        Production Electron integration test
services/backend/ Local FastAPI service, provider adapters and tool schemas
docs/             Implementation, compatibility and validation notes
```

Settings live in Electron's application-data directory, normally
`~/Library/Application Support/jarvis-desktop/settings.json` in development.
`JARVIS_USER_DATA_DIR` selects an isolated directory for tests. Settings contain
no recordings, transcripts or keys. Local audio files are limited to 30 MB;
codec availability depends on Electron.

See the [complete created-file manifest](docs/files.md) for the exact project files.

Next: validate Phase 3 on the target Mac, then implement user-controlled memory
and simulation-first robotics. See [AI details](docs/ai.md) and [voice details](docs/voice.md).
