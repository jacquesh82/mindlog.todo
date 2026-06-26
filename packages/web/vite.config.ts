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
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
