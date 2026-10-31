import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// MV3 content scripts can't be ES modules, so this builds a single self-contained IIFE.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      name: 'findMyTimeContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
