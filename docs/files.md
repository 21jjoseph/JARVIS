# Project files

Historical Phases 1–2 manifest. See [the exact V3 created/modified file list](v3-files.md) for the current update. Models, dependencies and generated outputs are ignored.

- [.env.example](../.env.example)
- [.gitignore](../.gitignore)
- [.npmrc](../.npmrc)
- [.nvmrc](../.nvmrc)
- [.prettierrc.json](../.prettierrc.json)
- [AGENTS.md](../AGENTS.md)
- [README.md](../README.md)
- [apps/desktop/electron/main.ts](../apps/desktop/electron/main.ts)
- [apps/desktop/electron/policy.ts](../apps/desktop/electron/policy.ts)
- [apps/desktop/electron/preload.ts](../apps/desktop/electron/preload.ts)
- [apps/desktop/electron/settings.ts](../apps/desktop/electron/settings.ts)
- [apps/desktop/electron/tray.png](../apps/desktop/electron/tray.png)
- [apps/desktop/electron/voice/client.ts](../apps/desktop/electron/voice/client.ts)
- [apps/desktop/electron/voice/commands.ts](../apps/desktop/electron/voice/commands.ts)
- [apps/desktop/electron/voice/controller.ts](../apps/desktop/electron/voice/controller.ts)
- [apps/desktop/electron/voice/inference.ts](../apps/desktop/electron/voice/inference.ts)
- [apps/desktop/electron/voice/keywords.ts](../apps/desktop/electron/voice/keywords.ts)
- [apps/desktop/electron/voice/models.ts](../apps/desktop/electron/voice/models.ts)
- [apps/desktop/electron/voice/sherpa.d.ts](../apps/desktop/electron/voice/sherpa.d.ts)
- [apps/desktop/electron/voice/system-speech.ts](../apps/desktop/electron/voice/system-speech.ts)
- [apps/desktop/electron/voice/vad.ts](../apps/desktop/electron/voice/vad.ts)
- [apps/desktop/electron/voice/worker.ts](../apps/desktop/electron/voice/worker.ts)
- [apps/desktop/index.html](../apps/desktop/index.html)
- [apps/desktop/src/avatar/Ferrofluid.tsx](../apps/desktop/src/avatar/Ferrofluid.tsx)
- [apps/desktop/src/avatar/profiles.ts](../apps/desktop/src/avatar/profiles.ts)
- [apps/desktop/src/avatar/shaders.ts](../apps/desktop/src/avatar/shaders.ts)
- [apps/desktop/src/components/Icon.tsx](../apps/desktop/src/components/Icon.tsx)
- [apps/desktop/src/components/Overlay.tsx](../apps/desktop/src/components/Overlay.tsx)
- [apps/desktop/src/dashboard/Dashboard.tsx](../apps/desktop/src/dashboard/Dashboard.tsx)
- [apps/desktop/src/dashboard/SettingsPanel.tsx](../apps/desktop/src/dashboard/SettingsPanel.tsx)
- [apps/desktop/src/hooks/useJarvis.ts](../apps/desktop/src/hooks/useJarvis.ts)
- [apps/desktop/src/main.tsx](../apps/desktop/src/main.tsx)
- [apps/desktop/src/services/audio.ts](../apps/desktop/src/services/audio.ts)
- [apps/desktop/src/services/bridge.ts](../apps/desktop/src/services/bridge.ts)
- [apps/desktop/src/services/i18n.ts](../apps/desktop/src/services/i18n.ts)
- [apps/desktop/src/styles.css](../apps/desktop/src/styles.css)
- [apps/desktop/src/voice/VoicePanel.tsx](../apps/desktop/src/voice/VoicePanel.tsx)
- [apps/desktop/src/voice/capture.worklet.js](../apps/desktop/src/voice/capture.worklet.js)
- [apps/desktop/src/voice/session.ts](../apps/desktop/src/voice/session.ts)
- [apps/desktop/src/voice/voice.css](../apps/desktop/src/voice/voice.css)
- [configs/cloud-display.conf](../configs/cloud-display.conf)
- [configs/voice-models.json](../configs/voice-models.json)
- [docs/compatibility.md](../docs/compatibility.md)
- [docs/implementation-plan.md](../docs/implementation-plan.md)
- [docs/validation.md](../docs/validation.md)
- [docs/voice.md](../docs/voice.md)
- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
- [playwright.config.ts](../playwright.config.ts)
- [scripts/build-electron.mjs](../scripts/build-electron.mjs)
- [scripts/check-compatibility.mjs](../scripts/check-compatibility.mjs)
- [scripts/check-macos-artifacts.py](../scripts/check-macos-artifacts.py)
- [scripts/dev.mjs](../scripts/dev.mjs)
- [scripts/download-macos-electron.mjs](../scripts/download-macos-electron.mjs)
- [scripts/install-cloud-node.py](../scripts/install-cloud-node.py)
- [scripts/install-electron.mjs](../scripts/install-electron.mjs)
- [scripts/setup-cloud.sh](../scripts/setup-cloud.sh)
- [scripts/start-macos.sh](../scripts/start-macos.sh)
- [scripts/verify-voice.ts](../scripts/verify-voice.ts)
- [scripts/voice-models-cli.ts](../scripts/voice-models-cli.ts)
- [services/backend/README.md](../services/backend/README.md)
- [shared/contracts/index.ts](../shared/contracts/index.ts)
- [shared/contracts/machine.ts](../shared/contracts/machine.ts)
- [shared/contracts/voice.ts](../shared/contracts/voice.ts)
- [tests/e2e/desktop.spec.ts](../tests/e2e/desktop.spec.ts)
- [tests/e2e/voice.spec.ts](../tests/e2e/voice.spec.ts)
- [tests/unit/audio.test.ts](../tests/unit/audio.test.ts)
- [tests/unit/contracts.test.ts](../tests/unit/contracts.test.ts)
- [tests/unit/machine.test.ts](../tests/unit/machine.test.ts)
- [tests/unit/policy.test.ts](../tests/unit/policy.test.ts)
- [tests/unit/settings.test.ts](../tests/unit/settings.test.ts)
- [tests/unit/voice.test.ts](../tests/unit/voice.test.ts)
- [tsconfig.json](../tsconfig.json)
- [vite.config.ts](../vite.config.ts)
- [vitest.config.ts](../vitest.config.ts)
- [docs/files.md](files.md)

## Phase 3 additions

- `services/backend/jarvis_backend/`: local service, versioned contracts, provider
  adapters and typed tool schemas; `requirements.lock` pins all wheel hashes.
- `apps/desktop/electron/ai/`: Python lifecycle/client, central orchestrator,
  independent tool validation, one-use permissions, OS adapters and audit.
- `apps/desktop/src/ai/`: text conversation, provider setup, cloud consent and
  per-action approval interface.
- `shared/contracts/ai.ts`: narrow renderer-facing AI/permission contract.
- `configs/python-runtime*.json`, `scripts/setup-backend.mjs`,
  `scripts/bundle-backend.*`: pinned Python bootstrap and packaged runtimes.
- `scripts/start-local-ai-macos.sh`: optional checksum-pinned compatible local
  Ollama CLI/model setup, separate from the main launcher.
- `services/backend/tests/`, `tests/unit/ai*.test.ts`,
  `tests/e2e/ai*.spec.ts`: provider, privacy, permission and voice/AI checks.
- `docs/ai.md`: AI setup, protocol, privacy, tool behavior and explicit limits.
