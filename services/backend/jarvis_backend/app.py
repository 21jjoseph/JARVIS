import asyncio
import hmac
import json
from pathlib import Path
from contextlib import suppress
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from .contracts import Turn
from .providers import Providers, ProviderError
from .intelligence import Intelligence, ChatProvider
from .local_engine import LocalEngine
from .model_setup import ModelSetup
from .contracts import StrictModel
from pydantic import Field
from typing import Literal
from .speech_cloud import SpeechRequest,synthesize,relay_live
from websockets.exceptions import WebSocketException


class LocalAction(StrictModel):
    action: Literal['status','discover','preview','import','install','cancel_download','start','stop']
    value: str = Field(default='',max_length=1500)
    directory: str = Field(default='',max_length=1500)
    endpoint: str = Field(default='http://127.0.0.1:8080',max_length=150)
    threads: int = Field(default=2,ge=1,le=8)
    idle_seconds: int = Field(default=600,ge=60,le=3600)
    approved: bool = False
    license_accepted: bool = False


class Connection(StrictModel):
    provider: Literal['gemini','openai','llama','ollama']
    endpoint: str = 'http://127.0.0.1:8080'


class ToolResult(StrictModel):
    continuation: str = Field(min_length=20,max_length=100)
    text: str = Field(max_length=8000)
    cloud_consent: bool = False


def create_app(token: str, client: httpx.AsyncClient | None = None, config: dict | None = None):
    if len(token) < 32:
        raise ValueError("A strong session token is required")

    @asynccontextmanager
    async def lifespan(app):
        app.state.client = client or httpx.AsyncClient(timeout=httpx.Timeout(90, connect=3),
                                                       trust_env=False, follow_redirects=False)
        app.state.remote = client or httpx.AsyncClient(timeout=httpx.Timeout(90,connect=10),
                                                       trust_env=True,follow_redirects=False)
        app.state.engine=LocalEngine((config or {}).get('engine_binary',''),
            external_key=(config or {}).get('external_key',''),external_endpoint=(config or {}).get('external_endpoint','http://127.0.0.1:8080'))
        app.state.setup=ModelSetup(app.state.remote)
        app.state.intelligence=Intelligence(app.state.client,app.state.remote,app.state.engine)
        yield
        await app.state.setup.cancel()
        await app.state.engine.stop()
        if client is None:
            await app.state.client.aclose()
            await app.state.remote.aclose()

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
        request._body = bytes(body)
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

    @app.post('/v2/connection')
    async def connection(body:Connection,x_cloud_key:str=Header(default='')):
        if len(x_cloud_key)>512: raise HTTPException(422,'Invalid credential')
        provider=ChatProvider(body.provider,app.state.client if body.provider in ('llama','ollama') else app.state.remote,
            '',body.endpoint,key=x_cloud_key,headers=app.state.engine.headers(body.endpoint))
        try:
            models=await provider.discover()
            return {'available':True,'models':models,'error':None,'provider':body.provider}
        except ProviderError as error:
            return {'available':False,'models':[],'error':str(error),'provider':body.provider}
        except (httpx.HTTPError,ValueError):
            return {'available':False,'models':[],'error':'Provider unavailable; check configuration and network access','provider':body.provider}

    @app.post('/v2/speech')
    async def speech(body:SpeechRequest,x_cloud_key:str=Header(default='')):
        if len(x_cloud_key)>512: raise HTTPException(422,'Invalid credential')
        try: return await synthesize(app.state.remote,body,x_cloud_key)
        except ProviderError as error: raise HTTPException(400,str(error)) from None
        except (httpx.HTTPError,ValueError): raise HTTPException(502,'Cloud speech unavailable') from None

    @app.websocket('/v2/speech/live')
    async def live_speech(socket:WebSocket):
        protocols=socket.headers.get('sec-websocket-protocol','').split(',')
        valid=socket.headers.get('origin') is None and any(hmac.compare_digest(value.strip(),token) for value in protocols if value.strip().isascii())
        if not valid: await socket.close(code=1008);return
        await socket.accept(subprotocol='21-audio')
        try:
            raw=await asyncio.wait_for(socket.receive_text(),10)
            if len(raw)>20_000: raise ValueError('Speech configuration too large')
            config=SpeechRequest.model_validate_json(raw)
            await relay_live(socket,app.state.remote,config)
        except (WebSocketDisconnect,asyncio.CancelledError): pass
        except (ProviderError,httpx.HTTPError,ValueError,TimeoutError,OSError,WebSocketException):
            with suppress(RuntimeError): await socket.send_json({'kind':'error','message':'Cloud speech is unavailable or unauthorized; using local fallback.'})
        finally:
            with suppress(RuntimeError): await socket.close()

    @app.post('/v2/local')
    async def local(body:LocalAction):
        engine=app.state.engine;setup=app.state.setup
        try:
            if body.action=='status':
                return {'engine':await engine.status(),'download':setup.progress,
                        'engine_installed':bool(engine.binary and engine.binary.is_file())}
            if body.action=='discover': return {'repositories':await setup.discover()}
            if body.action=='preview': return {'files':await setup.preview(body.value)}
            if body.action=='import': return await setup.import_file(body.value)
            if body.action=='install': return await setup.install(body.value,body.directory,body.approved,body.license_accepted)
            if body.action=='cancel_download': await setup.cancel();return setup.progress
            if body.action=='stop': await engine.stop();return await engine.status()
            if body.action=='start':
                if not body.approved: raise ValueError('Explicit approval is required before loading a local model')
                model=await setup.import_file(body.value)
                return await engine.start(model['path'],body.endpoint,body.threads,body.idle_seconds)
        except (OSError,ValueError) as error:
            raise HTTPException(400,str(error)[:200]) from None
        except httpx.HTTPError:
            raise HTTPException(502,'Official model source unavailable. Check network access, model license and authentication.') from None

    @app.post('/v2/tools/continue')
    async def tool_continue(body:ToolResult):
        nonlocal active
        if busy.locked(): raise HTTPException(409,'Another AI request is running')
        async with busy:
            active=asyncio.create_task(app.state.intelligence.continue_tool(body.continuation,body.text,body.cloud_consent))
            try:
                async with asyncio.timeout(95): return await active
            except (httpx.HTTPError,ProviderError,ValueError,TimeoutError,asyncio.CancelledError):
                return {'text':'The desktop action completed; its AI follow-up is unavailable. See the actual local result.',
                        'provider':'offline','tool':None,'error':'Tool follow-up unavailable'}
            finally: active=None

    @app.post('/v2/stream')
    async def stream_turn(body:Turn,x_cloud_key:str=Header(default='')):
        nonlocal active
        if len(x_cloud_key)>512: raise HTTPException(422,'Invalid credential')
        if busy.locked(): raise HTTPException(409,'Another AI request is running')
        await busy.acquire()
        queue=asyncio.Queue(maxsize=32)
        async def produce():
            try:
                async with asyncio.timeout(95):
                    async for event in app.state.intelligence.run(body,x_cloud_key): await queue.put(event)
            except asyncio.CancelledError:
                # A disconnected consumer cannot drain a full queue. Cancellation
                # must release the producer and the single-request lock promptly.
                while not queue.empty(): queue.get_nowait()
                queue.put_nowait({'kind':'final','text':'','provider':'offline','tool':None,'error':'AI request cancelled.'})
            except (TimeoutError,ProviderError,httpx.HTTPError,ValueError):
                await queue.put({'kind':'final','text':'','provider':'offline','tool':None,
                                 'error':'Request timed out or provider failed. No background retry was started.'})
            finally:
                if asyncio.current_task().cancelling():
                    if queue.full(): queue.get_nowait()
                    queue.put_nowait(None)
                else: await queue.put(None)
        active=asyncio.create_task(produce())
        task=active
        async def output():
            nonlocal active
            try:
                while True:
                    event=await queue.get()
                    if event is None: break
                    yield json.dumps(event,ensure_ascii=False)+'\n'
            finally:
                if not task.done(): task.cancel()
                with suppress(asyncio.CancelledError): await task
                if active is task: active=None
                busy.release()
        return StreamingResponse(output(),media_type='application/x-ndjson',headers={'Cache-Control':'no-store'})

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
