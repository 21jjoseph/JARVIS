See [V3 hybrid AI setup and verification](../../docs/v3-report.md) for current
Gemma/Gemini routing, speech, privacy and authenticated API details. The original
v1 API remains for regression compatibility.

# JARVIS local AI service

Python 3.12 + FastAPI/Pydantic, launched and authenticated by Electron. See
[Phase 3 architecture and protocol](../../docs/ai.md). Setup with
`npm run backend:setup`, test with `npm run test:backend` from repository root.
No key or model is required for service startup and offline desktop commands.

`requirements.in` records direct choices; `requirements.lock` pins the full
resolved graph with PyPI wheel SHA256 hashes. Install only with the repository
setup script (hash verification and binary wheels). Optional exporters and
native uvloop/httptools servers are not installed. The OpenTelemetry API is an
inert FastAPI dependency; no exporter, collector or instrumentation is configured.
