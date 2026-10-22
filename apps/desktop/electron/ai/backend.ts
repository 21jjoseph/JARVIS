import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export class Backend {
  private child: ChildProcessWithoutNullStreams | null = null;
  private port = 0;
  private token = randomBytes(32).toString('hex');
  message = 'AI service has not started.';
  constructor(
    private root: string,
    private resources?: string,
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
      this.message = 'AI service needs setup. Run the JARVIS launcher to install Python 3.12.';
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
    child.stdin.end(JSON.stringify({ token: this.token }) + '\n');
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
      this.message = 'AI service stopped. Restart JARVIS. Local voice commands remain available.';
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
        ? AbortSignal.any([signal, AbortSignal.timeout(100_000)])
        : AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`AI service returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 128_000) throw new Error('AI reply exceeded its limit.');
    return JSON.parse(text) as unknown;
  }
  stop() {
    this.port = 0;
    this.child?.kill('SIGTERM');
    this.child = null;
  }
}
