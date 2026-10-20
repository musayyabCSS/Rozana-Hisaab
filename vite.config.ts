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
      injectRegister: null,
      manifest: false,
      workbox: {
        // Precache app assets PLUS index.html for cold offline launches
        globPatterns: [
          '**/*.{js,css,ico,png,svg,json,webmanifest,woff2}',
          'index.html',
        ],
        // Exclude standalone pages that cause Cloudflare 308 redirect loops
        globIgnores: ['**/terms.html', '**/privacy.html'],
        navigateFallback: '/index.html',
        // Prevent SPA fallback routing from hijacking APIs or static pages
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