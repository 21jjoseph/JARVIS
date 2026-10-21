# JARVIS engineering constraints

- Use the existing isolated checkout. No worktrees unless requested.
- Target macOS Monterey 12 / Intel x86_64. Electron must be **38–43**, never 44+.
  Current pin: **43.8.3**. Node: **22.23.4**. Keep `minimumSystemVersion=12.0`
  and default macOS architecture `x64`.
- Read `docs/compatibility.md` before changing dependencies. Check native Mach-O
  deployment targets, not just npm engines. Preserve exact pins and lockfile
  unless a necessary dependency change is tested.
- Phase 1 is the ferrofluid avatar. Do not present future AI, speech, memory,
  vision or robotics as implemented.
- Keep strict TypeScript, the shared state reducer and narrow preload API.
  Validate privileged input and sender frames in main. Never expose arbitrary
  IPC, shell, filesystem or Node primitives to the renderer.
- Microphone capture must be explicit, local and visible. Release tracks on all
  stop/hide/close/error paths. No recording or uploads. No camera by default.
- Preserve transparent roots, real signal-driven deformation, reduced motion,
  adaptive quality and hidden-window throttling.
- Run `npm run check:compat`, `npm test`, `npm run build` and, when a display is
  available, `npm run test:e2e`. Distinguish Linux/synthetic tests from native
  macOS and physical microphone checks.
- Python is not needed by Phase 1. Use Python 3.12 with Monterey-compatible
  dependencies for the future local backend.
