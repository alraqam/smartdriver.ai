import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SmartDriverAI web — Vite + React, mobile-first.
//
// /api is proxied to the API in development so the browser sees a single
// origin and CORS never enters the picture locally. In the container, nginx
// does the same job (see nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4175 },
});
