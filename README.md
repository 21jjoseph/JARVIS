# JARVIS

**21Robotics · Personal hybrid AI assistant · Phase 1**

A local desktop companion built around an animated, metallic ferrofluid avatar.
This milestone implements the visual desktop shell and real audio analysis.
Conversation AI, speech recognition, wake words, memory, vision, desktop
automation and robotics are planned for later phases.

## Monterey / Intel quick start

Requires **macOS Monterey 12 or later on Intel x86_64**. The launcher downloads
the official **Node 22.23.4 Intel build** into this project's `.cache/` directory,
verifies its SHA256, and installs the locked dependencies. **nvm is not required**.
No Python service, account or API key is needed. Internet is needed for setup.

First [download the project ZIP from GitHub](https://github.com/21jjoseph/JARVIS/archive/refs/heads/main.zip)
and extract it on your Mac. Sign in to GitHub if requested. The GitHub ZIP
contains a top-level `JARVIS-main` folder. For example, if you extract it in Downloads:

```sh
cd "$HOME/Downloads/JARVIS-main" && bash scripts/start-macos.sh
```

The `&&` stops the command if the directory is missing, so npm cannot accidentally
run against a different project in your home folder. The launcher uses its own
location as the working directory and does not change your Conda installation,
system Node or shell startup files. Initial dependency downloads may take a few
minutes. Repeat the same command to launch again.

If you have the separate `JARVIS-source.zip` bundle instead, its folder is named
`JARVIS`; use that folder name in the command. Files created in a cloud workspace
are not automatically copied to your computer.

If you already have **nvm installed** and prefer to manage Node yourself, use the
following from the extracted JARVIS folder instead:

```sh
nvm install
nvm use
npm ci
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
- **Click** to enable/stop the microphone (a short delay distinguishes double-click).
- **Double-click**, use the dashboard button, or press **⌘⇧J** to open the control room.
- The **menu-bar/tray menu** shows/hides the avatar, stops audio, opens the dashboard or quits.
- Closing the dashboard leaves the companion in the menu bar. Use **Quit JARVIS** to exit.
- Click-through outside the circular interaction region is enabled by default on
  macOS and Windows. Linux uses normal hit testing.

macOS asks for microphone access when you enable it. If blocked, open
**System Preferences → Security & Privacy → Privacy → Microphone**, allow the app
or development host shown there, then restart it. Camera and screen permissions
are denied in Phase 1.

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
npm test              # state, validation, settings, audio maths, origin policy
npm run build         # strict checks + renderer and Electron production bundles
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
services/backend/ Future Python service notes (not active)
docs/             Implementation, compatibility and validation notes
```

Settings live in Electron's application-data directory, normally
`~/Library/Application Support/jarvis-desktop/settings.json` in development.
`JARVIS_USER_DATA_DIR` selects an isolated directory for tests. Settings contain
no recordings, transcripts or keys. Local audio files are limited to 30 MB;
codec availability depends on Electron.

See the [complete created-file manifest](docs/files.md) for the exact project files.

Next: local voice activation and STT/TTS, then hybrid AI/tools, user-controlled
memory, and simulation-first robotics. Complete native Phase 1 checks first.
