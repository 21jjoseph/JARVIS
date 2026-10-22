import asyncio
import hmac
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .contracts import Turn
from .providers import Providers, ProviderError


def create_app(token: str, client: httpx.AsyncClient | None = None):
    if len(token) < 32:
        raise ValueError("A strong session token is required")

    @asynccontextmanager
    async def lifespan(app):
        app.state.client = client or httpx.AsyncClient(timeout=httpx.Timeout(90, connect=3),
                                                       trust_env=False, follow_redirects=False)
        yield
        if client is None:
            await app.state.client.aclose()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    busy = asyncio.Lock()
    active: asyncio.Task | None = None

    def authorized(value: str | None, origin: str | None):
        # Electron main has no Origin. Browser cross-origin calls are always rejected.
        return origin is None and value is not None and value.isascii() and hmac.compare_digest(value, "Bearer " + token)

    @app.middleware("http")
    async def auth(request: Request, call_next):
        if not authorized(request.headers.get("authorization"), request.headers.get("origin")):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        # Read a bounded body before the JSON parser (also handles chunked input).
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 20_000:
                return JSONResponse({"error": "Request too large"}, status_code=413)
        async def receive():
            return {"type": "http.request", "body": bytes(body), "more_body": False}
        request._body = bytes(body)
        request._receive = receive
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _exception):
        # Pydantic's default error includes the input; do not echo prompts or keys.
        return JSONResponse({"error": "Invalid request"}, status_code=422)

    @app.get("/v1/health")
    async def health():
        return {"version": 1, "status": "ready"}

    @app.get("/v1/models")
    async def models():
        try:
            return {"models": await Providers(app.state.client).models(), "error": None}
        except (httpx.HTTPError, ProviderError):
            return {"models": [], "error": "Ollama is not available at 127.0.0.1:11434. Start the local server and install a model."}

    async def execute(turn: Turn, key: str):
        if busy.locked():
            raise HTTPException(409, "Another AI request is running")
        nonlocal active
        async with busy:
            active = asyncio.create_task(Providers(app.state.client).complete(turn, key))
            try:
                async with asyncio.timeout(95):
                    return await active
            except asyncio.CancelledError:
                error = "AI request cancelled."
            except (httpx.HTTPError, TimeoutError):
                error = "AI provider is unavailable or timed out. Local commands still work."
            except ProviderError as e:
                error = str(e)
            finally:
                active = None
            return {"text": "", "provider": "offline", "tool": None, "error": error}

    @app.post("/v1/cancel")
    async def cancel():
        if active is not None:
            active.cancel()
        return {"cancelled": True}

    @app.post("/v1/turn")
    async def turn(body: Turn, x_cloud_key: str = Header(default="")):
        if len(x_cloud_key) > 512:
            raise HTTPException(422, "Invalid credential")
        return await execute(body, x_cloud_key)

    @app.websocket("/v1/events")
    async def events(socket: WebSocket):
        if not authorized(socket.headers.get("authorization"), socket.headers.get("origin")):
            await socket.close(code=1008)
            return
        await socket.accept()
        # Local streaming lifecycle, not synthetic token streaming. Cloud keys are HTTP-only.
        try:
            raw = await asyncio.wait_for(socket.receive_text(), timeout=30)
            if len(raw) > 20_000:
                await socket.close(code=1009)
                return
            turn = Turn.model_validate_json(raw)
            if turn.route != "local":
                await socket.close(code=1008)
                return
            await socket.send_json({"event": "thinking"})
            await socket.send_json({"event": "reply", "data": await execute(turn, "")})
        except (WebSocketDisconnect, TimeoutError):
            pass
        except ValueError:
            await socket.close(code=1008)
        else:
            await socket.close()

    return app
