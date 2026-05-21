import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration (the frontend's development and build tool).
// Documentation: https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, "/api" calls are forwarded to the backend.
    // This avoids any CORS issue: the browser only talks to Vite.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
