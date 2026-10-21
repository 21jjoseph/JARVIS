import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'apps/desktop',
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
  resolve: { alias: { '@shared': resolve('shared') } },
});
