import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const valid = (cmd) => {
  try {
    execFileSync(cmd, ['-c', 'import sys; assert sys.version_info[:2] == (3,12)'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};
let python = process.env.JARVIS_PYTHON || 'python3.12';
if (!valid(python) && valid('python3')) python = 'python3';
if (!valid(python) && process.platform === 'darwin' && process.arch === 'x64') {
  const pin = JSON.parse(readFileSync('configs/python-runtime.json', 'utf8'));
  const base = join(root, '.cache/toolchains/python-3.12.15-darwin-x64');
  const archive = join(root, '.cache/toolchains/python-darwin-x64.tar.gz');
  mkdirSync(join(root, '.cache/toolchains'), { recursive: true });
  if (
    !existsSync(archive) ||
    createHash('sha256').update(readFileSync(archive)).digest('hex') !== pin.sha256
  )
    run('/usr/bin/curl', [
      '--fail',
      '--location',
      '--retry',
      '2',
      '--max-time',
      '300',
      pin.url,
      '-o',
      archive,
    ]);
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== pin.sha256)
    throw new Error('Python checksum failed. Installation stopped.');
  if (!existsSync(join(base, 'python/bin/python3.12'))) {
    mkdirSync(base, { recursive: true });
    run('/usr/bin/tar', ['-xzf', archive, '-C', base]);
  }
  python = join(base, 'python/bin/python3.12');
}
if (!valid(python))
  throw new Error(
    'Python 3.12 is required. On Intel macOS the launcher downloads a verified compatible runtime automatically.',
  );
const venv = resolve('.cache/backend-venv');
const bin = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!valid(bin)) run(python, ['-m', 'venv', venv]);
const fingerprint = createHash('sha256')
  .update(readFileSync('services/backend/requirements.lock'))
  .digest('hex');
const stamp = join(venv, '.jarvis-lock');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
  run(bin, [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--cache-dir',
    resolve('.cache/pip'),
    '--require-hashes',
    '--only-binary=:all:',
    '-r',
    'services/backend/requirements.lock',
  ]);
  writeFileSync(stamp, fingerprint);
}
run(bin, [
  '-c',
  'import fastapi,httpx,uvicorn,wsproto; print("JARVIS Python backend ready (3.12).")',
]);
