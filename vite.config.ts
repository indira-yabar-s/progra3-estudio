/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages sirve el sitio en /<repo>/. En desarrollo usamos la raíz.
const base = process.env.BASE_PATH ?? '/progra3-estudio/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? base : '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Telar — laboratorio de concurrencia',
        short_name: 'Telar',
        description:
          'Verificador visual de concurrencia: explora todas las intercalaciones de hilos y encuentra races y deadlocks.',
        lang: 'es',
        theme_color: '#1a0b2e',
        background_color: '#12081f',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        // Monaco es grande; lo precacheamos igual para que la app funcione offline.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/__tests__/**', 'src/core/**/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
}));
