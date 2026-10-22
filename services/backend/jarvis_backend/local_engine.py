"""One owned llama-server, conservative resources and loopback-only endpoints."""
import asyncio
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit
import httpx


def loopback_url(value: str) -> str:
    url=urlsplit(value)
    if url.scheme!='http' or url.username or url.password or url.query or url.fragment:
        raise ValueError('Local endpoint must be plain HTTP on a loopback address')
    if url.path not in ('','/') or not url.port:
        raise ValueError('Specify a loopback address and port, without a path')
    if url.hostname not in ('127.0.0.1','::1','localhost'):
        raise ValueError('Local inference must remain on localhost')
    return value.rstrip('/')


class LocalEngine:
    def __init__(self, binary: str='', log_dir: str='', external_key: str='', external_endpoint: str='http://127.0.0.1:8080'):
        self.binary=Path(binary) if binary else None
        self.log_dir=Path(log_dir) if log_dir else None
        self.external_key=external_key if len(external_key)<=512 else ''
        self.external_endpoint=loopback_url(external_endpoint)
        self.process: asyncio.subprocess.Process | None=None
        self.endpoint=''
        self.model=''
        self.key=''
        self.started=0.0
        self.last_used=time.monotonic()
        self.loading=False
        self.active_requests=0
        self.error: str | None=None
        self.load_ms: float | None=None
        self._lock=asyncio.Lock()
        self._idle: asyncio.Task | None=None

    def headers(self,endpoint):
        key=self.key if endpoint==self.endpoint and self.key else self.external_key if endpoint==self.external_endpoint else ''
        return {'Authorization':'Bearer '+key} if key else {}

    async def start(self,model: str,endpoint='http://127.0.0.1:8080',threads=2,idle_seconds=600):
        endpoint=loopback_url(endpoint)
        if not 1<=threads<=8 or not 60<=idle_seconds<=3600: raise ValueError('Invalid resource settings')
        path=Path(model).expanduser().resolve(strict=True)
        with path.open('rb') as handle:
            if handle.read(4)!=b'GGUF': raise ValueError('Select a verified GGUF model')
        if not self.binary or not self.binary.is_file(): raise ValueError('Build the compatible llama.cpp engine first')
        async with self._lock:
            if self.process and self.process.returncode is None:
                if self.model==str(path) and self.endpoint==endpoint: return await self.status()
                raise ValueError('Unload the current model before loading another')
            async with httpx.AsyncClient(trust_env=False,timeout=2) as client:
                try:
                    await client.get(endpoint+'/health')
                    raise ValueError('This local endpoint is already in use; attach to it or choose another port')
                except httpx.TransportError: pass
            self.key=secrets.token_hex(32)
            self.endpoint=endpoint;self.model=str(path);self.loading=True;self.error=None
            self.started=time.monotonic();self.last_used=self.started
            # Model and endpoint are user configuration, never model-generated arguments.
            host=urlsplit(endpoint).hostname
            args=[str(self.binary),'-m',str(path),'--host',host,'--port',str(urlsplit(endpoint).port),
                  '--ctx-size','4096','--parallel','1','--batch-size','128','--ubatch-size','64','--threads',str(threads),
                  '--threads-batch',str(threads),'--n-gpu-layers','0','--jinja',
                  '--alias','gemma-4-local','--no-webui']
            # API key in the process environment, not command arguments.
            env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT','WINDIR')}
            env['LLAMA_API_KEY']=self.key
            self.process=await asyncio.create_subprocess_exec(*args,env=env,
                stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
            process=self.process
            self._idle=asyncio.create_task(self._unload_idle(idle_seconds))
        async with httpx.AsyncClient(trust_env=False,timeout=3) as client:
            for _ in range(180):
                if self.process is not process:
                    raise ValueError('Local model loading was cancelled')
                if process.returncode is not None:
                    self.loading=False;self.error='Local inference process exited while loading'
                    raise ValueError(self.error)
                try:
                    response=await client.get(endpoint+'/health',headers=self.headers(endpoint))
                    if response.status_code==200:
                        self.loading=False;self.load_ms=(time.monotonic()-self.started)*1000
                        return await self.status()
                except httpx.HTTPError: pass
                await asyncio.sleep(1)
        await self.stop()
        raise ValueError('Model loading timed out after 180 seconds; try a smaller verified E2B model')

    async def _unload_idle(self,seconds):
        while True:
            await asyncio.sleep(min(seconds,30))
            if time.monotonic()-self.last_used>=seconds and not self.loading and self.active_requests==0:
                await self.stop();return

    async def stop(self):
        async with self._lock: await self._stop()

    async def _stop(self):
        task=self._idle;self._idle=None
        if task and task is not asyncio.current_task(): task.cancel()
        process=self.process;self.process=None
        self.loading=False
        if process and process.returncode is None:
            process.terminate()
            try: await asyncio.wait_for(process.wait(),5)
            except TimeoutError: process.kill();await process.wait()
        self.key=''

    def touch(self): self.last_used=time.monotonic()

    async def status(self):
        running=bool(self.process and self.process.returncode is None)
        rss=None;cpu=None
        if running:
            try:
                process=await asyncio.create_subprocess_exec('ps','-o','rss=,%cpu=','-p',str(self.process.pid),
                  stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
                output,_=await asyncio.wait_for(process.communicate(),2)
                columns=output.decode().split();rss=int(columns[0])*1024;cpu=float(columns[1])
            except (OSError,ValueError,IndexError,TimeoutError): pass
        return {'running':running,'loading':self.loading,'model_path':self.model,'endpoint':self.endpoint,
                'pid':self.process.pid if running else None,'rss_bytes':rss,'cpu_percent':cpu,
                'load_ms':self.load_ms,'error':self.error,'owned':True,
                'available_threads':max(1,min(4,(os.cpu_count() or 2)//2))}
