import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  optimizeDeps: {
    // These load only after a click or an export. Prebundle them so the first
    // session does not reload once Vite finishes discovering them.
    include: ['tone', '@sur/audio-engine/tone-accompaniment', '@breezystack/lamejs'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sur AI Music Studio',
        short_name: 'Sur',
        description: 'Private, on-device singing practice and live accompaniment.',
        theme_color: '#11100e',
        background_color: '#11100e',
        display: 'standalone',
        start_url: '/studio',
        scope: '/',
        icons: [
          {
            src: '/icons/sur.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{html,js,css,ogg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/worklets\//],
      },
    }),
  ],
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
});
