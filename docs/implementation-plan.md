# Phase 1 implementation

1. Build an original Three.js ferrofluid renderer: displaced high-detail geometry, animated magnetic ridges, procedural reflections, interpolated state profiles and audio-driven deformation.
2. Share a validated state/settings contract between a sandboxed React renderer and Electron. Keep filesystem/window privileges in the main process and use a small explicit preload bridge.
3. Provide a transparent draggable overlay, separate dashboard, tray controls, shortcut, bounded position persistence, and platform-aware settings.
4. Analyse microphone and local audio playback with Web Audio. Request microphone access only from a user action; never record or transmit audio. Include a clearly labelled generated audio test.
5. Verify strict TypeScript, state transitions, IPC validation, settings persistence, production compilation, and actual Electron behavior under a virtual display when available.

Phase 1 needs no Python service, cloud credentials, wake-word model or network API. FastAPI, hybrid AI, memory, vision and robotics remain later phases. They are not presented as functioning integrations.

Host: Debian Linux x86-64. Target: macOS Monterey 12 on Intel x86-64. Use Node 22.23.4 and Electron 43.8.3 (maximum major 43); the macOS deployment target is 12.0 and the default DMG architecture is x64. Linux is useful for development and automated checks but cannot establish native macOS permission, login-item or compositor behavior.
