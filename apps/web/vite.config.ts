import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// `vite build --mode artifact` emits one self-contained page (no code splitting)
// so it can be inlined into a single HTML fragment by scripts/build-artifact.mjs.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    cssCodeSplit: mode !== 'artifact',
    modulePreload: mode === 'artifact' ? false : undefined,
    rollupOptions: mode === 'artifact' ? { output: { inlineDynamicImports: true } } : undefined,
  },
}));
