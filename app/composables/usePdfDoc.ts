import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * PDF の bytes を pdfjs で 1 回だけ開き、全ページの描画で共有する。
 *
 * - bytes は呼び出し側が認証付きで取ってくる。pdfjs の worker は渡した buffer を
 *   transfer (detach) するので、毎回 `slice(0)` した独立コピーを渡す
 *   (ippoan/nuxt-notify の app/utils/preview-fetch.ts と同じ理由)
 * - worker は `?url` で bundle に載せたものを使う (CDN を読まない)
 */
async function pdfjs() {
  const lib = await import('pdfjs-dist')
  if (!lib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
  }
  return lib
}

export function usePdfDoc(data: Ref<ArrayBuffer | null>) {
  const doc = shallowRef<PDFDocumentProxy | null>(null)
  const error = ref('')
  const pageCount = computed(() => doc.value?.numPages ?? 0)
  let seq = 0

  async function open() {
    const mine = ++seq
    error.value = ''
    const old = doc.value
    doc.value = null
    await old?.destroy()
    if (!data.value) return
    try {
      const lib = await pdfjs()
      const opened = await lib.getDocument({ data: new Uint8Array(data.value.slice(0)) }).promise
      if (mine !== seq) {
        await opened.destroy()
        return
      }
      doc.value = opened
    }
    catch (e) {
      if (mine === seq) error.value = `PDF を開けませんでした: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  watch(data, open, { immediate: true })
  onBeforeUnmount(() => {
    seq++
    doc.value?.destroy()
  })

  return { doc, error, pageCount }
}
