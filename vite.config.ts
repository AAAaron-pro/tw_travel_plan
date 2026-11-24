import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function normalizeBase(raw?: string): string {
  if (!raw || raw === '/') return '/';
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

const base = normalizeBase(process.env.VITE_BASE_PATH ?? process.env.BASE_PATH);

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        lang: 'zh-Hant-TW',
        name: '台灣國內與離島旅遊規劃',
        short_name: '台旅規劃',
        description: '台灣本島與離島分帳、身分優惠與海象雨備行程規劃工具',
        theme_color: '#f4f4f0',
        background_color: '#f4f4f0',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}'],
      },
    }),
  ],
});
