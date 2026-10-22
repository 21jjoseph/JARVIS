# 21 engineering constraints (legacy JARVIS identifiers retained)

- Use the existing isolated checkout. No worktrees unless requested.
- Target macOS Monterey 12 / Intel x86_64. Electron must be **38–43**, never 44+.
  Current pin: **43.8.3**. Node: **22.23.4**. Keep `minimumSystemVersion=12.0`
  and default macOS architecture `x64`.
- Read `docs/compatibility.md` before changing dependencies. Check native Mach-O
  deployment targets, not just npm engines. Preserve exact pins and lockfile
  unless a necessary dependency change is tested.
- Phase 1 is the ferrofluid avatar; the user confirmed its visibility and real
  microphone response on Intel Monterey. Phase 2 implements local wake-word,
  Whisper transcription and Piper speech. Phase 3 adds a Python 3.12 FastAPI
  service, Ollama/OpenAI adapters, explicit consent, chat and approved tools.
  Read docs/ai.md. Do not present memory, vision or robotics as implemented.
- Use the portable `sherpa-onnx` WASM runtime in its worker. The checked native
  `sherpa-onnx-node` packages require newer macOS and must not be substituted.
  Preserve model SHA256 pins, bounded PCM packets and cancellation of stale
  inference. Never store raw microphone audio on disk.
- Keep strict TypeScript, the shared state reducer and narrow preload API.
  Validate privileged input and sender frames in main. Never expose arbitrary
  IPC, shell, filesystem or Node primitives to the renderer.
- Microphone capture must be explicit, local and visible. Release tracks on all
  stop/hide/close/error paths. No disk recording. The user's Master Update V3
  authorizes optional Gemini audio uploads only with explicit in-app speech
  consent, cloud enabled and Hybrid/Cloud mode. Local mode never uploads.
  No camera by default.
- Preserve transparent roots, real signal-driven deformation, reduced motion,
  adaptive quality and hidden-window throttling.
- Run `npm run check:compat`, `npm test`, `npm run build`, `npm run voice:check`
  and, with a display, `npm run test:e2e`. First install models with
  `npm run voice:models`. Distinguish actual model inference on synthetic speech
  from native macOS, physical microphone and `/usr/bin/say` validation.
- Python 3.12 is required for Phase 3. Run npm run backend:setup and
  npm run test:backend. Keep hash-locked wheels and the pinned relocatable
  runtime. Run scripts/bundle-backend.py --mac before Intel Mac packaging.
- Keep provider URLs fixed, routes explicit and cloud consent per request. Never
  upload audio without speech consent, or tool results/context without separate
  explicit result/context sharing consent. Local-only requests never escalate. Never
  print keys. Store optional cloud keys using OS encryption, never plaintext.
- Desktop tools require a consumed, owner-bound, expiring ticket and independent
  main-process validation. No generic shell or model-provided paths. Keep
  metadata-only audits and cancellation. Never substitute native sherpa addons.
- Optional local AI uses audited Ollama CLI 0.5.7 (Intel target 11.3); the checked
  0.6.8 executable targets 13.0. Do not silently upgrade it. Protocol fixtures
  do not establish live model/provider or native macOS validation.

- Official assistant identity: 21, spoken Twenty One in both languages. Preserve
  legacy app ID, data paths and settings while supporting all three Twenty One
  wake phrases and Casual/Professional modes. Never normalize unrelated numeric
  occurrences of 21 in technical text.
- Gemma 4 E2B QAT Q4_0 is preferred; E4B is optional. No large weight download
  without previewed source/revision/size/SHA256/license and explicit approval.
  Do not guess Hugging Face repository IDs or silently substitute a model.
- Pin llama.cpp source; CPU only, context 4096, parallel 1, Metal/Accelerate OFF
  for the initial Monterey build. Native Mac execution is unverified in Linux.
- Gemini model preferences must be checked against actual key-specific model
  discovery. Missing requested IDs are unavailable, not silently substituted.
  Never claim fixture tests are real Gemini/Gemma inference or benchmark results.
