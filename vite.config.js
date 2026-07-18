import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manual chunk splits to fix the "1 MB" bundle warning on build. Phosphor
// icons are bundled heavy and used app-wide, so we split them into a
// lazily-loaded vendor chunk. The dashboard tab mounts lazily inside the
// same chunk as the rest of the renderer.
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
