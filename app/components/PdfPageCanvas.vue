<script setup lang="ts">
/**
 * PDF の 1 ページだけを canvas に描く (pdfjs-dist)。
 *
 * - bytes は呼び出し側が認証付きで取ってくる。pdfjs の worker は渡した buffer を
 *   transfer (detach) するので、毎回 `slice(0)` した独立コピーを渡す
 *   (ippoan/nuxt-notify の app/utils/preview-fetch.ts と同じ理由)
 * - worker は `?url` で bundle に載せたものを使う (CDN を読まない)
 */
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

const props = defineProps<{
  data: ArrayBuffer | null
  pageNo: number
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref('')
const rendering = ref(false)
const pageCount = ref(0)
const scale = ref(1.5)

let doc: PDFDocumentProxy | null = null
let task: RenderTask | null = null

async function pdfjs() {
  const lib = await import('pdfjs-dist')
  if (!lib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = worker.default
  }
  return lib
}

async function loadDoc() {
  error.value = ''
  await doc?.destroy()
  doc = null
  pageCount.value = 0
  if (!props.data) return
  try {
    const lib = await pdfjs()
    doc = await lib.getDocument({ data: new Uint8Array(props.data.slice(0)) }).promise
    pageCount.value = doc.numPages
    await render()
  }
  catch (e) {
    error.value = `PDF を開けませんでした: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function render() {
  if (!doc || !canvas.value) return
  if (props.pageNo < 1 || props.pageNo > doc.numPages) {
    error.value = `PDF に ${props.pageNo} ページ目がありません (全 ${doc.numPages} ページ)`
    return
  }
  task?.cancel()
  rendering.value = true
  try {
    const page = await doc.getPage(props.pageNo)
    const viewport = page.getViewport({ scale: scale.value })
    const ratio = window.devicePixelRatio || 1
    const el = canvas.value
    el.width = Math.floor(viewport.width * ratio)
    el.height = Math.floor(viewport.height * ratio)
    el.style.width = `${Math.floor(viewport.width)}px`
    const ctx = el.getContext('2d')
    if (!ctx) return
    task = page.render({
      canvasContext: ctx,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    })
    await task.promise
  }
  catch (e) {
    if ((e as { name?: string })?.name !== 'RenderingCancelledException') {
      error.value = `PDF を描けませんでした: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  finally {
    rendering.value = false
  }
}

function zoom(delta: number) {
  scale.value = Math.min(4, Math.max(0.5, Math.round((scale.value + delta) * 10) / 10))
  render()
}

watch(() => props.data, loadDoc)
watch(() => props.pageNo, render)
onMounted(loadDoc)
onBeforeUnmount(() => {
  task?.cancel()
  doc?.destroy()
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-sm">
      <span>{{ pageNo }} ページ目<template v-if="pageCount"> / 全 {{ pageCount }} ページ</template></span>
      <UButton icon="i-lucide-zoom-out" size="xs" color="neutral" variant="outline" aria-label="縮小" @click="zoom(-0.25)" />
      <UButton icon="i-lucide-zoom-in" size="xs" color="neutral" variant="outline" aria-label="拡大" @click="zoom(0.25)" />
      <span v-if="rendering" class="text-(--ui-text-muted)">描画中…</span>
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <div class="overflow-auto rounded border border-(--ui-border) bg-white">
      <canvas ref="canvas" class="block max-w-none" />
    </div>
  </div>
</template>
