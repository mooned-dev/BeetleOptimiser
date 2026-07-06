import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manual chunk splits to fix the "1 MB" bundle warning on build.
// Firebase libraries are heavyweight + only needed when the user interacts
// with account/buy/ask-a-question. Splitting them out shrinks the main
// entry chunk so the dashboard renders much faster on cold load.
//
// Reference: https://rollupjs.org/configuration-options/#output-manualchunks
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
            return 'firebase-vendor';
          }
          if (id.includes('node_modules/@phosphor-icons/')) {
            return 'phosphor-vendor';
          }
          // Everything else stays in the main entry chunk for fast first paint.
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
