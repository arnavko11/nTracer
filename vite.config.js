import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the built app from the filesystem, so asset URLs must be
// relative ('./assets/...') rather than absolute ('/assets/...').
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { port: 5173, strictPort: true },
});
