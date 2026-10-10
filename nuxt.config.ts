// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // SPA。auth-worker JWT を fragment/storage で復元して gate し、PDF は pdfjs-dist で
  // ブラウザが描くので SSR は使わない。
  ssr: false,

  runtimeConfig: {
    public: {
      // auth-worker (JWT 発行 / refresh / LINE WORKS webhook の受け口)
      authWorkerUrl: process.env.NUXT_PUBLIC_AUTH_WORKER_URL || '',
    },
  },

  nitro: {
    preset: 'cloudflare_module',
  },

  // server route (/api/proxy) が import する @ippoan/auth-client/server (.mjs) を
  // Nitro が解決できるよう transpile 対象に含める。
  build: {
    transpile: ['@ippoan/auth-client'],
  },

  vite: {
    optimizeDeps: {
      exclude: ['@ippoan/auth-client'],
    },
  },

  // chunk load 失敗からの自動復旧は @ippoan/auth-client/module が入れる
  // (Refs ippoan/auth-worker#452)。
  modules: [
    '@vite-pwa/nuxt',
    '@nuxt/ui',
    '@ippoan/auth-client/module',
  ],

  css: ['~/assets/css/main.css'],

  // theme-color は Nuxt UI の既定 primary (green-500)。
  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#22c55e' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ],
    },
  },

  // インストール可能にするだけで、オフライン起動はしない。runtimeCaching を
  // 定義しないので /api/proxy/** と /auth/** は SW に触られない。更新は prompt 方式
  // (app/plugins/pwa-update.client.ts が $pwa.needRefresh を見て toast を出す)。
  pwa: {
    client: { installPrompt: true },
    registerType: 'prompt',
    manifest: {
      name: '休暇申請の紐づけ',
      short_name: '休暇申請',
      lang: 'ja',
      start_url: '/',
      display: 'standalone',
      theme_color: '#22c55e',
      background_color: '#ffffff',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,ico,png,svg}'],
    },
  },
})
