# Phase 3 validation

Validated on Linux x86_64 using Node 22.23.4, Electron 43.8.3 and Python
3.12.14 for development / 3.12.15 for packaged runtime.

- Reproducible setup, strict TypeScript and production build pass.
- **66 JavaScript tests**, **8 Python backend tests**, **4 source Electron
  integration tests**, and **7 actual speech-model checks** pass, without skips.
- AI tests start the real Python subprocess and use actual local HTTP transport
  to a labelled Ollama fixture; cloud parsing and consent use HTTP transport
  fixtures. They do not claim a real language model or paid cloud request.
- Spoken AI: generated speech → Chromium capture → VAD → Whisper → Python
  orchestrator → provider fixture → Piper → measured avatar amplitude passes.
  Voice-triggered approval navigates to conversation; cancelling inference
  prevents stale speech.
- Approval ownership, expiry, denial, replay, exact argument binding, unsupported
  tools, cloud consent, bounded files, provider errors and offline behavior pass.
- Packaged Linux app starts its bundled relocatable Python and passes AI and
  voice integration. Intel Mac `.app` cross-packages with Python/backend included;
  version 0.3.0 and minimum macOS 12.0 are checked in its plist.
- All **12** native binaries in the staged Intel Python bundle target <=12.0:
  Python/dylibs 10.15, Pydantic core 10.12. Existing Electron/native npm binaries
  retain verified Monterey targets. No npm dependency version was changed.
- Checked optional Ollama CLI 0.6.8 requires macOS 13 and was rejected. The pinned
  0.5.7 CLI's Intel slice targets 11.3; native execution remains unverified.
- `npm audit --omit=dev`: zero reported vulnerabilities. PyPI release advisory
  metadata for all 19 locked Python packages: no listed advisories. These are
  point-in-time checks, not a claim of complete security.
- A first-word KWS miss on a generated clip was diagnosed by replaying the same
  audio with/without leading silence. A 250 ms feature-context pre-roll resolved
  the test; neither the keyword threshold nor model pins were weakened.
- Slow speech inference originally caused capture packets to be discarded. A
  FIFO bounded to 16 packets (about two seconds) now preserves continuity; a
  busy-inference unit test checks packet order. Overflow stops capture with an
  actionable error instead of silently losing speech.
- Both Mac launchers pass Bash syntax checks. Native bootstrap, Ollama model
  download/inference, OpenAI credentials, Keychain storage, system file dialogs,
  app opening/focus and all new Phase 3 behavior still need a Monterey run.

No OpenAI key or local Ollama model was available in cloud. The optional model
registry was unavailable from this environment. These are optional live-provider
checks; offline functionality and protocol integration were actually exercised.
DMG/signing/notarization and native Windows execution are not validated here.
Vite emits its existing advisory chunk-size warning (~216 KB compressed).
The backend test client emits an upstream httpx deprecation warning; tests pass.

The historical Phase 1–2 results below describe those earlier milestones.

# Phases 1–2 validation

An additional voice integration run passed against the actual packaged Linux
executable, including the unpacked worker/WASM assets, capture, inference,
playback, wake word and cancellation. This is separate from the two source-build
Electron tests below and is not a native macOS execution claim.

Validated on Debian Linux x86_64 using **Node 22.23.4** and **Electron 43.8.3**.

| Check                                                    | Outcome                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean reproducible setup (`bash scripts/setup-cloud.sh`) | Passed: official Node SHA256 check, frozen npm install, compatibility checks, unit suite and production build                                       |
| Strict TypeScript                                        | Passed, including main, preload, renderer and tests                                                                                                 |
| Production dependency audit                              | No known vulnerabilities reported by `npm audit --omit=dev`                                                                                         |
| Unit suite                                               | **58 passed** across six files; no skipped tests                                                                                                    |
| Real Electron integration                                | **2 passed**, using production bundles on a virtual Xorg display: desktop regression plus full voice loop                                           |
| Real model inference                                     | **5 passed**: English/Piper synthesis and Whisper transcription, Jarvis keyword detection, Romanian/Mihai synthesis and transcription               |
| Local voice loop                                         | Prerecorded speech passed capture → VAD → Whisper → time command → Piper → measured playback; speaking amplitude was observed in the avatar runtime |
| Wake and cancellation                                    | Actual keyword detection triggered spoken acknowledgement; mute/cancellation during inference returned to OFF without stale audio                   |
| Fresh model installation                                 | All four archives downloaded from official HTTPS sources into an empty cache, verified against SHA256 pins, extracted and individually verified     |
| Procedural WebGL rendering                               | Avatar and dashboard rendered and were visually inspected                                                                                           |
| State synchronization                                    | All eight manual states propagated between windows                                                                                                  |
| Audio test                                               | Actual synthesized playback produced measured amplitude and speaking-state deformation                                                              |
| Microphone path                                          | Known prerecorded WAV through Chromium capture produced measured listening-state amplitude; stop released the session                               |
| Security boundaries                                      | Renderer has no `require`; isolation/sandbox preferences set; invalid settings and states rejected; camera denied; second audio owner refused       |
| Desktop interaction                                      | Pointer drag moved the window; double-click opened dashboard without delayed microphone activation; position/appearance restored after full restart |
| Shutdown                                                 | Application exited and persisted settings; audio ownership cleared                                                                                  |
| Vite development readiness                               | HTTP 200 with expected application entry                                                                                                            |
| Development Electron renderer                            | Loaded the avatar from the running Vite server using the development URL                                                                            |
| Mac source launcher                                      | Bash syntax and unsupported-host rejection checked; native macOS bootstrap remains unrun                                                            |
| Monterey artifact audit                                  | Intel Electron executable/helpers/framework/dylibs and native toolchain dependencies all declare minimum OS <= 12.0                                 |
| Intel Mac packaging                                      | Unsigned `release/mac/JARVIS.app` built on Linux; plist and executable both declare macOS 12.0                                                      |

Linux test command:

```sh
DISPLAY=:99 JARVIS_TEST_NO_SANDBOX=1 npm run test:e2e
```

The display used the installed Xorg dummy driver with
`configs/cloud-display.conf`. The test-only sandbox flag is needed for this
container's lack of user namespaces; application defaults remain sandboxed.
SwiftShader and prerecorded capture are test-only flags. There is no physical
microphone or Intel Mac GPU attached to this machine.

The production renderer bundle includes Three.js and React and currently emits
Vite's advisory 500 kB chunk warning (about 214 kB compressed). It builds and
loads successfully. GPU performance must be measured on the target Mac; software
rendering here does not demonstrate 60 FPS hardware performance.

## Native Monterey checklist (not executed here)

The user reported that the Phase 1 avatar and physical microphone response work
on their Intel Monterey Mac. That does not establish every check below or the new
Phase 2 speech path. Synthetic model checks include imperfect Romanian text;
the intended command is asserted, not perfect recognition.

1. Use Node 22, run `npm ci`, then `npm run dev` on Intel Monterey.
2. Confirm the avatar is visible with genuinely transparent desktop margins.
3. Drag it across the screen; restart and verify its position.
4. Double-click and use ⌘⇧J to open the control room. Preview every state.
5. Enable the microphone, grant system permission and speak. Verify input-level
   movement and avatar response. Deny access once and confirm the readable error.
6. Stop capture, hide/minimize its window and quit; confirm microphone use ends.
7. Test a local audio file and the audible test tone. Confirm outgoing audio,
   not an arbitrary timer, drives the surface.
8. Verify click-through margins and always-on-top with other applications.
9. Compare Adaptive and Eco on the Intel GPU; enable reduced motion.
10. Build/install the DMG, test the login item and menu-bar controls, then quit.

DMG creation, Apple signing/notarization, real device permissions and macOS
compositor behavior remain unverified. Windows native execution is also unrun.
The first native desktop milestone is accepted only after this checklist works
on the user's Monterey machine.
