import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const python = resolve(
  '.cache/backend-venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
execFileSync(python, ['scripts/bundle-backend.py', ...process.argv.slice(2)], { stdio: 'inherit' });
