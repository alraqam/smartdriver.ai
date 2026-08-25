import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SmartDriverAI web — Vite + React, mobile-first.
//
// /api is proxied to the API in development so the browser sees a single
// origin and CORS never enters the picture locally. In the container, nginx
// does the same job (see nginx.conf).
const proxy = {
  '/api': {
    target: process.env.API_URL || 'http://localhost:3003',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, proxy },
  // The same proxy on preview, because preview is the only way to exercise the
  // service worker — it is registered in production builds only — and a PWA
  // that cannot reach the API is not a test of anything.
  preview: { port: 4175, proxy },
});
