# Future local service

Phase 1 runs entirely inside Electron and starts no Python service. FastAPI,
WebSockets, Pydantic, SQLite memory, AI routing and robotics belong to later
milestones. No unimplemented endpoint is presented as active.

Use Python 3.12 as the future baseline. Check every native dependency on
Monterey / Intel before adding it. Keep privileged execution and privacy
decisions outside model output. Version future backend messages explicitly;
the desktop contracts currently live in `shared/contracts`.
