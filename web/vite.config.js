import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// SmartDriverAI web — Vite + React, mobile-first.
//
// /api is proxied to the API in development so the browser sees a single
// origin and CORS never enters the picture locally. In the container, nginx
// does the same job (see nginx.conf).
// API_URL may come from the shell or from web/.env.local (gitignored), which is
// what makes it possible to point a preview at an API on a non-default port
// without editing this file.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const proxy = {
    '/api': {
      target: env.API_URL || 'http://localhost:3003',
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    server: { port: 5175, proxy },
    // The same proxy on preview, because preview is the only way to exercise
    // the service worker — it is registered in production builds only — and a
    // PWA that cannot reach the API is not a test of anything.
    preview: { port: 4175, proxy },
  };
});
