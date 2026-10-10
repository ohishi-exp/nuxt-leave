/**
 * 新しい service worker が待っているとき「新しい版があります」を toast で出し、
 * 押されたら適用する plugin。`nuxt.config.ts` の `pwa.registerType: 'prompt'` と対
 * (autoUpdate だと入力中でも reload で飛ぶ)。
 *
 * `$pwa` は @vite-pwa/nuxt が `enforce: 'post'` で provide するので、plugin の登録順に
 * 依存しないよう app:mounted 後に遅延で引く。PWA が無効な環境 (dev) では何もしない。
 */

/** `$pwa` のうちここが使う部分だけ。 */
interface PwaLike {
  needRefresh: { value: boolean }
  updateServiceWorker: (reloadPage?: boolean) => void
}

const CHECK_MS = 30_000
const TOAST_ID = 'pwa-update'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const toast = useToast()
    let shown = false

    window.setInterval(() => {
      const pwa = (nuxtApp as unknown as { $pwa?: PwaLike }).$pwa
      if (!pwa || shown || pwa.needRefresh.value !== true) return
      shown = true
      toast.add({
        id: TOAST_ID,
        title: '新しい版があります',
        duration: 0,
        actions: [{
          label: '更新',
          onClick: () => pwa.updateServiceWorker(),
        }],
      })
    }, CHECK_MS)
  })
})
