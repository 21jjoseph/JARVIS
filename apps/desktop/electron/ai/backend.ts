import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CloudCapture } from '../voice/cloud';

export class Backend {
  private child: ChildProcessWithoutNullStreams | null = null;
  private port = 0;
  private token = randomBytes(32).toString('hex');
  message = 'AI service has not started.';
  constructor(
    private root: string,
    private resources?: string,
    private data?:string,
  ) {}
  get ready() {
    return this.port !== 0;
  }
  async start() {
    const python =
      process.env.JARVIS_PYTHON ||
      (this.resources
        ? join(
            this.resources,
            process.platform === 'win32'
              ? 'backend-python/python.exe'
              : 'backend-python/bin/python3.12',
          )
        : join(
            this.root,
            '.cache/backend-venv',
            process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
          ));
    if (!existsSync(python)) {
      this.message = 'AI service needs setup. Run the 21 launcher to install Python 3.12.';
      return;
    }
    const cwd = this.resources
      ? join(this.resources, 'backend')
      : join(this.root, 'services/backend');
    const child = spawn(python, ['-m', 'jarvis_backend'], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
    this.child = child;
    child.stdin.on('error', () => {});
    const candidates=[this.resources ? join(this.resources,process.platform==='win32'?'backend-python/llama-server.exe':'backend-python/bin/llama-server'):'',join(this.root,'.cache/local-engine/build/bin/llama-server'),join(this.root,'.cache/llama-build-v3/bin/llama-server')];
    const engine_binary=process.env.JARVIS_LLAMA_BINARY || candidates.find(p=>p && existsSync(p)) || '';
    child.stdin.end(JSON.stringify({ token: this.token,engine_binary,state_directory:this.data || '',
      external_key:process.env.LLAMA_API_KEY||'',external_endpoint:process.env.LLAMA_ENDPOINT||'http://127.0.0.1:8080' }) + '\n');
    // Never forward backend stderr or provider payloads to the application log.
    child.stderr.resume();
    const announced = new Promise<number>((resolve) => {
      let line = '';
      child.stdout.on('data', (chunk: Buffer) => {
        line += chunk.toString();
        if (line.length > 1000) {
          child.kill();
          resolve(0);
          return;
        }
        if (line.includes('\n')) {
          try {
            const { port } = JSON.parse(line.split('\n')[0]!);
            resolve(Number.isInteger(port) && port > 0 && port < 65536 ? port : 0);
          } catch {
            resolve(0);
          }
        }
      });
      child.on('error', () => resolve(0));
      child.on('exit', () => resolve(0));
    });
    child.on('exit', () => {
      this.port = 0;
      this.message = 'AI service stopped. Restart 21. Local voice commands remain available.';
    });
    const abort = new AbortController();
    const timeout = delay(10_000, 0, { signal: abort.signal }).catch(() => 0);
    this.port = await Promise.race([announced, timeout]);
    abort.abort();
    if (!this.port) {
      child.kill();
      this.message = 'AI service could not start. Run the launcher again.';
      return;
    }
    for (let i = 0; i < 30; i++) {
      try {
        await this.request('/v1/health');
        this.message = 'Local AI service ready.';
        return;
      } catch {
        await delay(100);
      }
    }
    this.stop();
    this.message = 'AI service failed its readiness check.';
  }
  async request(path: string, body?: unknown, signal?: AbortSignal, key = ''): Promise<unknown> {
    if (!this.port) throw new Error(this.message);
    const response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(key ? { 'X-Cloud-Key': key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(path==='/v2/local'?190_000:100_000)])
        : AbortSignal.timeout(5000),
    });
    const limit=path==='/v2/speech'?8_000_000:128_000;
    if(!response.body)throw new Error('AI service returned an empty response.');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
    try {
      while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;
        if(bytes>limit){await reader.cancel();throw new Error('AI reply exceeded its limit.');}chunks.push(next.value);}
    }finally{reader.releaseLock();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {detail?:unknown;error?:unknown};
    if(!response.ok){
      const detail=value.detail??value.error;
      throw new Error(typeof detail==='string'&&detail.length<=200?detail:`AI service returned HTTP ${response.status}.`);
    }
    return value;
  }
  async stream(body:unknown,signal:AbortSignal,key:string,changed:(event:Record<string,unknown>)=>void):Promise<unknown> {
    if(!this.port) throw new Error(this.message);
    const response=await fetch(`http://127.0.0.1:${this.port}/v2/stream`,{
      method:'POST',redirect:'error',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...(key?{'X-Cloud-Key':key}:{})},
      body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(100_000)]),
    });
    if(!response.ok || !response.body) throw new Error(`AI service returned HTTP ${response.status}.`);
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let final:unknown;let received=0;
    try {
      while(true) {
        const item=await reader.read();if(item.done) break;
        buffer+=decoder.decode(item.value,{stream:true});received+=item.value.length;
        if(buffer.length>128_000 || received>1_000_000) throw new Error('AI stream exceeded its limit.');
        let newline:number;
        while((newline=buffer.indexOf('\n'))!==-1) {
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;
          const event=JSON.parse(line) as Record<string,unknown>;
          if(event.kind==='final') final=event;
          else changed(event);
        }
      }
    }finally{reader.releaseLock();}
    signal.throwIfAborted();
    if(!final) throw new Error('AI stream ended without a completed reply.');
    return final;
  }
  async speech(config:Record<string,unknown>,partial:(text:string)=>void,signal?:AbortSignal):Promise<CloudCapture>{
    if(!this.port)throw new Error(this.message);
    const capture=new CloudCapture(`ws://127.0.0.1:${this.port}/v2/speech/live`,this.token,config,partial);
    const onAbort=()=>capture.stop();signal?.addEventListener('abort',onAbort,{once:true});
    const timer=new AbortController();
    try {signal?.throwIfAborted();await Promise.race([capture.ready,delay(12_000,undefined,{signal:timer.signal}).then(()=>{throw new Error('Cloud speech setup timed out.');})]);return capture;}
    catch(error){capture.stop();throw error;}
    finally{timer.abort();signal?.removeEventListener('abort',onAbort);}
  }
  stop() {
    this.port = 0;
    this.child?.kill('SIGTERM');
    this.child = null;
  }
}
