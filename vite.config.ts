/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/daily-exercise/', // GitHub Pages 주소가 qkdrkfld.github.io/daily-exercise/
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '맨몸 PT',
        short_name: '맨몸 PT',
        lang: 'ko',
        display: 'standalone',
        background_color: '#111214',
        theme_color: '#111214',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: { environment: 'node' },
});
