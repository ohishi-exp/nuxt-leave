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
    '@nuxt/ui',
    '@ippoan/auth-client/module',
  ],

  css: ['~/assets/css/main.css'],
})
