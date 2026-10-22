# macOS Monterey 12 / Intel compatibility

## Cause and correction

The first scaffold selected **Electron 45.0.0**, **Node 24** and a macOS **13.0**
deployment target. Electron **44+ drops Monterey**, while official **Node 24 x64
binaries require macOS 13.5+**. Lowering only the plist target would not fix
either executable. Both toolchain selections have been corrected.

The project now pins **Electron 43.8.3** and **Node 22.23.4**, sets
`minimumSystemVersion: "12.0"`, and targets **x64 only** for Mac builds. No OS
upgrade is required. The ferrofluid renderer and existing features are retained.

## Dependency evidence

Native artifacts were fetched over verified HTTPS. npm tarballs were checked
against lockfile SHA512 integrity, Node against its official SHA256 manifest,
and Electron with its checksum-validating download helper.

| Component                   | Version                            | Monterey / Intel evidence                                                                                                                           |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron                    | 43.8.3                             | Intel executable, framework, helpers and dylibs declare minimum macOS **12.0** in Mach-O load commands                                              |
| Node.js                     | 22.23.4                            | Official x64 binary declares minimum **11.0**; Node 22 officially supports macOS 11+                                                                |
| React / React DOM           | 19.3.1                             | JavaScript only, executed in Electron Chromium; no additional native minimum                                                                        |
| Three.js / types            | 0.186.1 / 0.186.0                  | JavaScript/WebGL2 and types; actually rendered in Electron 43                                                                                       |
| Vite / React plugin         | 8.3.5 / 6.1.2                      | Node 22.12+ supported; production build passes under Node 22                                                                                        |
| Rolldown Intel binding      | 1.2.15                             | Native minimum **10.12**                                                                                                                            |
| Lightning CSS Intel binding | 1.33.0                             | Native minimum **10.12**                                                                                                                            |
| esbuild                     | 0.28.2                             | Intel executable minimum **12.0**                                                                                                                   |
| fsevents                    | 2.3.3                              | Native minimum **10.15**                                                                                                                            |
| Electron ZIP extractor      | 1.0.5                              | Intel slice of universal binary minimum **10.12**                                                                                                   |
| TypeScript                  | 5.9.3                              | JavaScript tool; strict checks pass on Node 22                                                                                                      |
| Vitest                      | 5.0.5                              | Node 22.12+; unit suite passes                                                                                                                      |
| Playwright test             | 1.64.1                             | Node 20+; tests installed Electron directly, without a newer browser download                                                                       |
| electron-builder            | 26.15.3                            | Works under Node 22; successfully creates Intel `.app`, plist and binary both targeting **12.0**                                                    |
| Python                      | 3.12.15 bundled / 3.12 development | Pinned Astral standalone Intel runtime and its dylibs declare minimum **10.15**; all 12 staged native binaries including Pydantic core audited <=12 |
| Local speech runtime        | sherpa-onnx 1.13.8                 | Pure WebAssembly + JavaScript, actually executed under Node 22 and Electron 43; no new Mach-O addon                                                 |

Type-only packages have no runtime platform requirements. React, React DOM and
Three.js plus the portable `sherpa-onnx` runtime are the production npm dependencies.
FastAPI 0.159.1, Pydantic 2.14.1 / core 2.50.1, Uvicorn 0.54.0, httpx 0.28.1
and wsproto 1.3.2 now power Phase 3. Core's Intel wheel declares **10.12**; the
remaining Python dependencies are portable Python. The entire graph has exact
wheel hashes in `services/backend/requirements.lock`. No uvloop or httptools
extra is used. PySerial, MQTT, vision and CoppeliaSim are not installed yet;
verify them when their phases are implemented. Python's installer and any future
native extension must explicitly support Monterey; do not add a Python version
or package requiring macOS 13. Phase 3 bundles Python and locks its dependencies;
see [AI setup](ai.md). The optional Ollama **0.6.8** CLI was rejected after its
Intel executable declared **13.0**. The optional local-AI launcher pins the
checked **0.5.7** CLI (Intel **11.3**) by SHA256. No automatic update is used.

The native `sherpa-onnx-node@1.13.8` addon was inspected and rejected because its
Intel `.node` binary targets macOS **15.0**. Checked 1.12.14 and 1.12.7 binaries
target **13.0** and **13.7**. The selected WASM package requires Node 18+ and runs
inside the compatible Electron/Node runtime. The optional macOS system voice
adapter uses the long-standing `/usr/bin/say` API; actual native execution remains
unverified. See [Phase 2 voice](voice.md) for model and privacy details.

The artifact audit checks metadata and x64 slices. It does not execute Darwin
binaries, prove all system symbols are available or measure an Intel GPU.
Native Monterey validation remains required. DMG creation, signing and
notarization need a Mac and were not run in Linux.

## Reproduce

```sh
nvm use
npm ci
npm run check:compat
npm test
npm run build
node scripts/download-macos-electron.mjs
python3 scripts/check-macos-artifacts.py --electron <printed-zip-path>
```

Use `NODE_USE_ENV_PROXY=1` for the standalone Electron downloader behind a proxy.
TLS and checksum verification stay enabled. The audit needs only Python's
standard library and writes `.cache/macos-audit/report.json`.

`check:compat` rejects Electron 44+, a non-Node-22 toolchain, mismatched exact
pins and non-Intel default packaging. Recheck native artifacts after lockfile
updates. Installing an arbitrary newer Electron is not a compatibility fix.

## Compatible platform APIs

- Transparent frameless windows and forwarded mouse hit testing use Electron's
  supported APIs on macOS/Windows. Linux click-through is marked unavailable.
- Login items use Electron's API in installed apps. The toggle is disabled in
  development. No newer OS login framework is required by application code.
- Microphone input uses getUserMedia/Web Audio and system permissions.
  Packaged Info.plist includes the microphone purpose string.
- Rendering uses WebGL2, without WebGPU or macOS 13-only graphics features.
  Eco mode reduces geometry and pixel ratio for older Intel GPUs.

## Primary references

- [Electron: macOS 12 removed in v44](https://github.com/electron/electron/blob/main/docs/breaking-changes.md#removed-macos-12-support)
- [Node 22 supported platforms](https://github.com/nodejs/node/blob/v22.x/BUILDING.md#platform-list)
- [Node 24 platform minimum (13.5 on macOS x64)](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list)
- [Node 22.23.4 distributions/checksums](https://nodejs.org/dist/v22.23.4/)
- [Electron 43.8.3 release](https://github.com/electron/electron/releases/tag/v43.8.3)
- [Python 3.12 on macOS](https://docs.python.org/3.12/using/mac.html)
- [CPython 3.12 universal2 installer deployment target](https://github.com/python/cpython/blob/v3.12.10/Mac/BuildScript/build-installer.py)

## V3 hybrid AI additions

All existing npm/runtime pins remain unchanged. The only new production Python
package is **websockets 15.0.1**, hash-locked for the Gemini Live relay. The actual
CPython 3.12 Intel wheel's speedups binary targets **macOS 10.13**. Rebuilding the
Mac Python bundle audited **13 native binaries**, maximum deployment **10.15**.

Optional build-only **CMake 3.31.6** and **Ninja 1.11.1.4** are separately
hash-locked. Their actual universal Mac wheels contain **five Intel binaries**;
all passed deployment checks, maximum **10.10**. These tools are not runtime
requirements. `engine:tools` audits Mac binaries before installing the wheels.

llama.cpp is pinned to `d77256999f211f8c0a5b12d13564f48d685b59e7`, archive SHA256
`50c25dadaf35c95d82c5c843c26444452482fc67d98ca70fcc71ea15215dc74c`.
The source contains Gemma 4 E2B/E4B support. Its CPU-only source build and CLI
execute on Linux. Mac builds set deployment 12.0 / x86_64 and treat unguarded newer
API availability as errors. Metal, Accelerate, OpenMP, native OpenSSL and the
server's subprocess feature are disabled. Network providers/downloaders retain
verified Python HTTPS. The loopback engine needs no native TLS dependency.

**Native Intel Monterey engine compilation and Gemma inference remain
unverified.** Build locally using `bash scripts/setup-gemma-macos.sh`; no weights
are downloaded by that script. Native CPU optimization is for that build machine;
rebuild the engine on another CPU rather than copying a host-optimized engine.
The source ZIP and Linux-created Mac app include no runnable Mac engine.

There is no newly discovered macOS 13 requirement in the added production
binary. Original incompatibility causes remain Electron 44+/the original 45
selection, Node 24, newer native sherpa packages and newer checked Ollama.
No dependency was blindly upgraded. Live Gemini protocol/model access, Mac
Keychain, audio permissions and actual GPU/CPU behavior require native/provider
validation, independent of binary deployment metadata.
