import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuration de Vite (outil de developpement et de build du frontend).
// Documentation : https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En developpement, les appels "/api" sont transmis au backend.
    // Cela evite tout probleme de CORS : le navigateur ne parle qu'a Vite.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
