# Phase 1 implementation

1. Build an original Three.js ferrofluid renderer: displaced high-detail geometry, animated magnetic ridges, procedural reflections, interpolated state profiles and audio-driven deformation.
2. Share a validated state/settings contract between a sandboxed React renderer and Electron. Keep filesystem/window privileges in the main process and use a small explicit preload bridge.
3. Provide a transparent draggable overlay, separate dashboard, tray controls, shortcut, bounded position persistence, and platform-aware settings.
4. Analyse microphone and local audio playback with Web Audio. Request microphone access only from a user action; never record or transmit audio. Include a clearly labelled generated audio test.
5. Verify strict TypeScript, state transitions, IPC validation, settings persistence, production compilation, and actual Electron behavior under a virtual display when available.

Phase 1 needs no Python service, cloud credentials, wake-word model or network API. FastAPI, hybrid AI, memory, vision and robotics remain later phases. They are not presented as functioning integrations.

Host: Debian Linux x86-64. Target: macOS Monterey 12 on Intel x86-64. Use Node 22.23.4 and Electron 43.8.3 (maximum major 43); the macOS deployment target is 12.0 and the default DMG architecture is x64. Linux is useful for development and automated checks but cannot establish native macOS permission, login-item or compositor behavior.

# Phase 3 implementation

Implemented: authenticated loopback FastAPI/Pydantic service with HTTP and
WebSocket lifecycle events, Ollama/OpenAI adapters, explicit routing and cloud
consent, offline commands, typed/independently validated tools, expiring one-use
approval, local OS adapter, metadata audit, text chat, voice orchestration,
cancellation, bounded inputs/replies and compatible Python packaging.

The optional local server uses checksum-pinned Ollama 0.5.7; checked 0.6.8
requires macOS 13 and was rejected. Existing npm versions remain pinned.
The first wake-word feature context is primed with 250 ms of silence so a word
spoken immediately after arming retains its leading phoneme.

Live paid cloud requests, downloaded local LLM inference and native Monterey
execution are unverified. Protocol fixtures are explicit. Persistent memory,
vision and robotics remain Phase 4 onward. See docs/ai.md for scope and setup.
