import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        // Precache app bundles, static assets, and only index.html for the SPA
        globPatterns: ['**/*.{js,css,ico,png,svg,json,webmanifest,woff2}'],
        // Explicitly exclude standalone legal pages from Workbox precache
        globIgnores: ['**/terms.html', '**/privacy.html'],
        navigateFallback: '/index.html',
        // Prevent SPA fallback routing from hijacking standalone pages or backend APIs
        navigateFallbackDenylist: [
          /^\/auth/,
          /^\/api/,
          /^\/functions/,
          /^\/terms/,
          /^\/privacy/,
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['/sw-push.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});