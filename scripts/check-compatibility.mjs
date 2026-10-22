import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const major = Number(pkg.devDependencies.electron.split('.')[0]);
assert(major >= 38 && major <= 43, 'Electron must support Monterey (38–43); never install 44+.');
assert.equal(pkg.build.mac.minimumSystemVersion, '12.0');
assert(
  pkg.build.mac.target.every((t) => t.arch.length === 1 && t.arch[0] === 'x64'),
  'Default Mac artifacts must target Intel x64.',
);
assert.equal(process.versions.node.split('.')[0], '22', 'Run checks with Node 22 (nvm use).');
assert(readFileSync('.nvmrc', 'utf8').trim().startsWith('22.'));
assert.equal(lock.packages['node_modules/electron'].version, pkg.devDependencies.electron);
assert(
  !lock.packages['node_modules/sherpa-onnx-node'],
  'Use the portable speech package; the checked native addon requires newer macOS.',
);
const wasm = readFileSync('node_modules/sherpa-onnx/sherpa-onnx-wasm-nodejs.wasm');
assert(
  wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])),
  'Missing portable speech WASM binary.',
);
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  assert(/^\d+\.\d+\.\d+$/.test(version), `${name} must be exactly pinned.`);
  assert.equal(lock.packages[`node_modules/${name}`].version, version, `${name} lockfile drift.`);
}
for (const name of [
  '@esbuild/darwin-x64',
  '@rolldown/binding-darwin-x64',
  'lightningcss-darwin-x64',
]) {
  assert(lock.packages[`node_modules/${name}`], `Missing Intel macOS build tool: ${name}`);
}
const python = JSON.parse(readFileSync('configs/python-runtime.json', 'utf8'));
assert.equal(python.major, 3);
assert.equal(python.minor, 12);
assert.equal(python.arch.family, 'x86_64');
assert.equal(python.os, 'darwin');
assert(/^[a-f0-9]{64}$/.test(python.sha256));
assert(
  python.url.startsWith('https://github.com/astral-sh/python-build-standalone/releases/download/'),
);
console.log(
  `Compatibility configuration passed: Node ${process.versions.node}, Electron ${pkg.devDependencies.electron}, macOS 12.0 / x64.`,
);
console.log(
  'This checks configuration and lockfile. Run scripts/check-macos-artifacts.py for Mach-O deployment targets; native Monterey testing is still required.',
);
