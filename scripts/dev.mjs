import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./build-electron.mjs');
const server = await createServer();
await server.listen();
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, JARVIS_DEV_URL: 'http://127.0.0.1:5173' },
});
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) child.kill('SIGTERM');
  await server.close();
  process.exit(code);
}
child.on('exit', (code) => void close(code ?? 1));
child.on('error', (error) => {
  console.error(error.message);
  void close(1);
});
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
console.log('JARVIS development renderer ready. Restart npm run dev after Electron changes.');
