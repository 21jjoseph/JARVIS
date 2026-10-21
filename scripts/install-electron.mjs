import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
// Electron 43 uses an explicit installer. Node 22's proxy support keeps the
// platform/corporate HTTPS proxy and TLS checks intact when downloading binaries.
const result = spawnSync(process.execPath, ['node_modules/electron/install.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    electron_config_cache: process.env.electron_config_cache || resolve('.cache/electron'),
    ...(process.env.HTTPS_PROXY || process.env.https_proxy ? { NODE_USE_ENV_PROXY: '1' } : {}),
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
