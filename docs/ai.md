# Phase 3: AI and approved desktop actions

Phase 3 adds a real Python 3.12 FastAPI/Pydantic service, an Ollama adapter,
an OpenAI adapter, explicit routing, text chat and a typed desktop tool registry.
The existing ferrofluid avatar, wake word, Whisper and Piper remain local.

## Start on Intel Monterey

Use the launcher in the extracted Phase 3 folder:

```sh
cd "$HOME/Downloads/JARVIS-phase-3" && bash scripts/start-macos.sh
```

It installs project-local Node 22 and Python 3.12 dependencies. If Python 3.12
is absent, it downloads the checksum-pinned relocatable Intel runtime. It does
not modify Conda, system Python, shell profiles or system Node. Initial setup
needs Internet; installed local voice, commands and local AI work offline.

Open **AI conversation / Conversație AI**. You can immediately try **Show system
info**, **Open calculator**, **Open downloads**, **Read a file**, **Find files
named report**, or their Romanian forms shown in the interface. These explicit
commands work without a language model. Each desktop operation requires approval.

## Optional local conversational AI

Ollama's current installer is not an appropriate Monterey default. The checked
**0.6.8 Intel executable requires macOS 13.0**. JARVIS supplies an optional,
checksum-pinned **0.5.7 CLI** launcher; its Intel Mach-O target is **11.3**.
The CLI has no desktop auto-updater. Native Monterey execution still needs testing.

With at least about **4 GB free disk space** and preferably **8 GB RAM or more**,
open a second Terminal window and run:

```sh
cd "$HOME/Downloads/JARVIS-phase-3" && bash scripts/start-local-ai-macos.sh
```

This explicit command downloads the server (~54 MB) and **qwen2.5:3b** (~1.9 GB).
It checks the server's pinned SHA256 before execution; Ollama verifies model layer
digests. Keep that terminal open. In JARVIS choose **Refresh connection**, then
select **qwen2.5:3b**. Try “Explain how an electric motor works.” CPU inference
on an older Intel laptop can take time; requests time out after 95 seconds.
Ctrl+C stops the server this launcher started. Models remain in the project's
ignored `.cache/ollama-models` directory. An already running server is reused
through the UI rather than replaced or stopped.

The adapter talks only to `127.0.0.1:11434`; it cannot be redirected to an Internet
host by model output or renderer input. Other installed Ollama models may work
if they support tools and the API used here. No language model is downloaded
automatically by JARVIS. The Ollama server/model are optional, outside the app bundle.

## Optional cloud AI

In **AI connections**, enter your OpenAI API key and choose **Save key securely**.
The Electron main process encrypts the saved key using the OS credential facility
(`safeStorage`, Keychain on macOS). It refuses Linux's plaintext fallback.
The renderer never receives a saved key. **Remove saved key** deletes that file.
Developers may instead supply `OPENAI_API_KEY` in the process environment; removing
a saved file does not remove an environment binding. Never put a key in chat,
source control or `.env.example`. No key is included in the download.

Choose **OpenAI cloud**, write a message and check the consent box for that
message. Editing the text or sending clears consent. Only the current message
and a fixed system instruction go to OpenAI over HTTPS. There is no automatic
cloud fallback. The default model is `gpt-4.1-mini`; change it to a model your
account supports if needed. API usage is billed by your provider.

Voice always uses local routing. Audio, selected files, filenames, desktop
tool results and previous messages are never automatically sent to cloud AI.
Cloud replies appear as text; local voice replies use Piper or `/usr/bin/say`.
Spoken replies are bounded to a 400-character excerpt; the full AI reply remains
available as text in the conversation panel.

## Permissions and tool behavior

The backend can propose one tool from a Pydantic registry. Electron independently
validates its name and arguments, then stores a random, single-use ticket bound
to the receiving window and the original arguments. The user sees the exact
operation and arguments. Approval expires after 60 seconds. Denial, cancellation,
a new request or closing/hiding the owner revokes pending approval. Voice actions
open the dashboard for review. Nothing from model text becomes a shell command.

| Tool             | Inputs and behavior                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system_info`    | No inputs; OS, CPU, architecture and app runtime versions.                                                                                                       |
| `open_app`       | Fixed choices: Calculator, TextEdit/text editor, file manager. macOS `/usr/bin/open -a` activates an existing app or opens it, with no shell.                    |
| `open_folder`    | Fixed Home, Documents or Downloads; no model-provided paths.                                                                                                     |
| `read_text_file` | OS picker after approval; one regular UTF-8 file, at most 128 KiB. Hidden paths and credential key files are rejected. No following of a replaced final symlink. |
| `find_files`     | A plain filename substring; user selects the folder. At most 2,000 entries, three levels, 100 matches and five seconds; hidden files and symlinks excluded.      |

Results display locally. They are not added to a model conversation. Tool
execution writes a metadata-only audit (`timestamp`, `tool`, `outcome`) in the
OS application data directory. Prompts, paths, keys, file contents and raw audio
are excluded. A failed audit write prevents execution. App/folder opening is
available on macOS and Windows; Linux supports the file manager and local reads.
Stop cancels AI inference and pending approval. An already approved OS operation
may finish; an open file chooser can be cancelled in the system dialog.

## Backend protocol and lifecycle

Electron launches Python itself, sends a fresh 256-bit session token through
stdin and waits for an authenticated health check. Uvicorn binds an ephemeral
port on **127.0.0.1** only. Every HTTP/WS operation requires a bearer token;
browser Origin headers are rejected. No token or key is placed in process
arguments, logs or settings. HTTP input is limited to 20 KB, user messages to
4,000 characters, provider JSON to 128 KB and replies to 2,000 characters. One
inference runs at a time. Capture uses a bounded 16-packet FIFO rather than
discarding PCM while the speech worker is busy; overflow stops capture visibly. Cancellation aborts the provider task and discards stale
results. Shutdown terminates the child service.

Version 1 endpoints: `GET /v1/health`, `GET /v1/models`, `POST /v1/turn`,
`POST /v1/cancel`, and `WS /v1/events`. WS emits real `thinking` and `reply`
lifecycle events for a local turn; partial token streaming is not implemented.
Desktop execution remains outside the Python service. API docs and CORS are
disabled. Redirects are rejected and provider URLs are fixed.

Source development uses `.cache/backend-venv`. Packaged Mac/Linux apps include a
relocatable Python runtime and their exact dependencies as external resources.
Mac packaging runs `scripts/bundle-backend.py --mac`, which audits every staged
Intel Mach-O before accepting the bundle. Python wheels are installed with exact
versions, `--require-hashes` and `--only-binary=:all:`. No native build is needed
on the user's Mac. Windows staging is also supported by the packaging script; native Windows execution is unverified.

## Validation and limits

Run `npm run backend:setup`, `npm run test:backend`, `npm test`, `npm run build`,
and `npm run test:e2e` with a graphical display. Tests exercise actual Python
startup, Electron UI/IPC, local HTTP transport to an Ollama protocol fixture,
provider parsing, cloud consent, malicious actions, approval ownership/expiry/
replay, local file bounds, cancellation and offline fallback. Provider fixtures
are labelled fixtures: **no live OpenAI account or installed Ollama model was
available in the cloud environment**. Cloud adapters are protocol-tested, not
validated against a paid request. Local model download/inference and native
Monterey use remain to be verified on the Mac.

There is no persistent conversation memory, arbitrary shell tool, background
file indexing, browser automation, camera, vision or robotics in Phase 3.
Tool results do not feed back into the model. Those limitations are deliberate
boundaries for this milestone, not claims that later phases are complete.
