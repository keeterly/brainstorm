import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Our own registration, in src/lib/sw.ts. The injected one is a bare
      // register(): it never asks whether a newer worker exists and never
      // reloads when one takes over, which with injectManifest means a running
      // app is pinned to the version it first loaded.
      injectRegister: null,
      // Our own worker, because the app needs to be reachable when it is not
      // open: a generated one can precache a shell but it cannot answer a push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Brainstorm',
        short_name: 'Brainstorm',
        description:
          'AI Thinking OS — turn scattered thoughts into connected ideas, visual maps, and actionable plans.',
        theme_color: '#04050a',
        background_color: '#04050a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // App shell + hashed assets are precached. Never cache API calls or
        // Supabase traffic (mirrors the old app's SW exclusions) — the routing
        // for that lives in src/sw.ts alongside the push handlers.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
