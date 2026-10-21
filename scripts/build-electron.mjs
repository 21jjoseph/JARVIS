import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: {
    main: 'apps/desktop/electron/main.ts',
    preload: 'apps/desktop/electron/preload.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
});
await copyFile('apps/desktop/electron/tray.png', 'dist-electron/tray.png');
