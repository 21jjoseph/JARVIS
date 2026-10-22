# 21 Master Update V3: incremental implementation and evidence

## A — Audit

Baseline: commit 48e7231, existing Electron/React/Three.js desktop and Python
FastAPI service. Preserve app ID and legacy user-data directory. Electron
43.8.3, Node 22.23.4 and hash-locked Python 3.12 dependencies remain pinned.
The repository has local Whisper/Piper/KWS, an Ollama/OpenAI provider pair,
explicit cloud consent, a single-use tool approval controller, and a bounded
audio FIFO. It has no long-term memory, personality mode or Twenty One wake
phrases yet. Add these settings incrementally; do not invent existing memories.

## B — Local AI first

Pin llama.cpp source with Gemma 4 support; build CPU-only, disable Metal and
Accelerate (its new LAPACK interface can require newer macOS). Build for macOS
12.0/x86_64 and reject unguarded newer APIs. Verify executable metadata on Mac.
Add a loopback-only, authenticated llama-server adapter and managed lifecycle;
concurrency one, 4096-token context and conservative configurable CPU threads.
Discover official Google Gemma 4 E2B/E4B GGUF repositories through Hub metadata,
verify revision, file size, SHA256 and GGUF architecture before activation.
Downloading weights requires a reviewed model card/size/license and explicit
in-app approval. An existing file can be selected and verified without download.

## C–D — Cloud and routing

Add Gemini through official API schemas, key-specific model discovery and
capability checks. Requested IDs are preferences until discovery verifies them.
Keep existing Ollama/OpenAI connections available. Centralize Local/Hybrid/Cloud
routing, bounded session context, privacy, per-turn overrides, finite fallback,
streaming, cancellation and measured usage/latency. Hybrid becomes default only
after cloud setup and consent. Local-only input never escalates to cloud.

## E–F — Voice and dashboard

Use one shared 21/Twenty One identity and Casual/Professional instructions.
Retain the old wake setting while also supporting Yo/Hey Twenty One and Twenty
One. Extend the existing voice pipeline for capability-checked Gemini speech
with explicit audio consent and local fallback. Preserve original transcripts;
calibration corrections measure accuracy and do not claim model retraining.
Extend the existing dashboard; keep the ferrofluid renderer and measured audio.

## G–H — Optimization and verification

Provide opt-in E2B/E4B benchmarking with real load/first-token/throughput/RAM/CPU
measurements. No model download or benchmark is automatic. Run existing and new
unit, backend, speech, build and Electron tests. Distinguish protocol fixtures,
Linux engine checks, native Monterey checks and live Gemini/Gemma inference.

## Initial external prerequisites

No GEMINI_API_KEY, GOOGLE_API_KEY or Hugging Face token is configured. Google
documentation and huggingface.co initially returned proxy 403. Required domains
and an optional secure Gemini binding were saved to the environment draft.
This does not publish the configuration or authorize downloading model weights.
Live model/API acceptance remains pending until these prerequisites are supplied.

## Delivered implementation / final boundary

All phases have source implementations: pinned CPU engine builder and explicit
model installer/importer; Gemini registry, REST/SSE and Live speech adapters;
central routing/context/consent/cancellation; actual audio output and calibration;
extended dashboard and opt-in benchmark. Existing adapters, settings and avatar
remain. See [delivery report](v3-report.md) for exact behavior and remaining
acceptance. Real Gemma/E4B benchmarks, requested Gemini model/API access and new
native Monterey behavior are **unverified**, not marked passed.
