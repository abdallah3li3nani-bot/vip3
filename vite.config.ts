import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // «prompt»: النسخة الجديدة تنتظر لحد ما المستخدم يضغط «تحديث الآن»
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: 'منصّة المعلّم — إدارة الدروس والطلاب',
        short_name: 'المعلّم',
        description: 'نظام متكامل لإدارة الطلاب والحصص والحضور والحسابات',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        background_color: '#0b1220',
        theme_color: '#2563eb',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'الطلاب', short_name: 'الطلاب', url: './#/students' },
          { name: 'المذكرات', short_name: 'المذكرات', url: './#/booklets' },
          { name: 'تسجيل الحضور', short_name: 'الحضور', url: './#/attendance' },
          { name: 'الحسابات', short_name: 'الحسابات', url: './#/finance' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: './index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ملاحظة أمنية: لا نخزّن ردود /rest/v1/ إطلاقًا.
          // الكاش مشترك بين المستخدمين على نفس المتصفح ولا يميّز رأس Authorization،
          // فتخزين بيانات طالب قد يعرضها لمستخدم آخر. البيانات تُجلب من الشبكة دائمًا.
          {
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'storage-cache',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(
      new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }),
    ),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
})
