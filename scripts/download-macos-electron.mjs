import { downloadArtifact } from '@electron/get';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const path = await downloadArtifact({
  version: pkg.devDependencies.electron,
  artifactName: 'electron',
  platform: 'darwin',
  arch: 'x64',
  cacheRoot: new URL('../.cache/electron/', import.meta.url).pathname,
});
console.log(path);
