import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({
  entryPoints: {
    main: 'apps/desktop/electron/main.ts',
    preload: 'apps/desktop/electron/preload.ts',
    'voice-worker': 'apps/desktop/electron/voice/worker.ts',
    'voice-models-cli': 'scripts/voice-models-cli.ts',
    'verify-voice': 'scripts/verify-voice.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron', 'sherpa-onnx'],
  sourcemap: true,
});
await copyFile('apps/desktop/electron/tray.png', 'dist-electron/tray.png');
