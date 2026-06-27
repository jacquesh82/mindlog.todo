import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, leave VITE_API_URL unset so the app calls same-origin `/api` and Vite
// proxies it to the API server. In Docker the build bakes VITE_API_URL.
//
// In production the app is served under the `/app` sub-path (the root is the
// marketing site), so `base` prefixes all built asset URLs with `/app/`.
// Overridable via VITE_BASE so dev (default `/`) and other hosts stay flexible.
export default defineConfig({
  // Use `||` (not `??`) so an empty-string build arg falls back to an absolute
  // root base. An empty base makes Vite emit relative asset URLs (./assets/…),
  // which break on nested client routes like /auth/reset (resolve to /auth/assets/…).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Accept the Host header forwarded by the dev nginx (todo.mindlog.localhost).
    allowedHosts: true,
    proxy: {
      // Used only when running Vite directly on the host; in Docker the nginx
      // sidecar already proxies /api, so this is a harmless fallback.
      '/api': process.env.VITE_DEV_API || 'http://localhost:8080',
    },
    // The dev server runs behind nginx + the TLS gateway, so the browser reaches
    // it at wss://todo.mindlog.localhost:443. A custom HMR path keeps the
    // WebSocket handshake clear of the gateway's exact `location = /` redirect.
    hmr: {
      host: process.env.VITE_HMR_HOST || 'todo.mindlog.localhost',
      protocol: process.env.VITE_HMR_PROTOCOL || 'wss',
      clientPort: Number(process.env.VITE_HMR_PORT) || 443,
      path: '/vite-hmr',
    },
  },
});
