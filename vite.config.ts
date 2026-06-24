import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL for Electron: ensures assets are loaded relatively
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    'process.env': {} 
  }
});