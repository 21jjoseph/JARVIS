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

| Component                   | Version                | Monterey / Intel evidence                                                                                                                        |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electron                    | 43.8.3                 | Intel executable, framework, helpers and dylibs declare minimum macOS **12.0** in Mach-O load commands                                           |
| Node.js                     | 22.23.4                | Official x64 binary declares minimum **11.0**; Node 22 officially supports macOS 11+                                                             |
| React / React DOM           | 19.3.1                 | JavaScript only, executed in Electron Chromium; no additional native minimum                                                                     |
| Three.js / types            | 0.186.1 / 0.186.0      | JavaScript/WebGL2 and types; actually rendered in Electron 43                                                                                    |
| Vite / React plugin         | 8.3.5 / 6.1.2          | Node 22.12+ supported; production build passes under Node 22                                                                                     |
| Rolldown Intel binding      | 1.2.15                 | Native minimum **10.12**                                                                                                                         |
| Lightning CSS Intel binding | 1.33.0                 | Native minimum **10.12**                                                                                                                         |
| esbuild                     | 0.28.2                 | Intel executable minimum **12.0**                                                                                                                |
| fsevents                    | 2.3.3                  | Native minimum **10.15**                                                                                                                         |
| Electron ZIP extractor      | 1.0.5                  | Intel slice of universal binary minimum **10.12**                                                                                                |
| TypeScript                  | 5.9.3                  | JavaScript tool; strict checks pass on Node 22                                                                                                   |
| Vitest                      | 5.0.5                  | Node 22.12+; unit suite passes                                                                                                                   |
| Playwright test             | 1.64.1                 | Node 20+; tests installed Electron directly, without a newer browser download                                                                    |
| electron-builder            | 26.15.3                | Works under Node 22; successfully creates Intel `.app`, plist and binary both targeting **12.0**                                                 |
| Python                      | Optional 3.12 baseline | CPython 3.12's official universal2 build recipe defaults to minimum **10.9**; no interpreter or Python package is bundled or required by Phase 1 |

Type-only packages have no runtime platform requirements. React, React DOM and
Three.js are the only production npm dependencies. FastAPI, PySerial, MQTT,
vision, voice models and CoppeliaSim dependencies are not installed yet; verify
them when their phases are implemented. Python's installer and any future
native extension must explicitly support Monterey; do not add a Python version
or package requiring macOS 13.

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
