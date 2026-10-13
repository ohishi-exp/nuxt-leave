<script setup lang="ts">
/**
 * 開いた PDF (usePdfDoc) の 1 ページだけを canvas に描く。doc は呼び出し側が共有する。
 */
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

const props = withDefaults(defineProps<{
  doc: PDFDocumentProxy | null
  pageNo: number
  scale?: number
  /** true なら欄の幅いっぱいに縮めて表示する (描画は scale のまま) */
  fit?: boolean
}>(), { scale: 0.4, fit: false })

const canvas = ref<HTMLCanvasElement | null>(null)
const error = ref('')
const rendering = ref(false)

let task: RenderTask | null = null

async function render() {
  const doc = props.doc
  const el = canvas.value
  if (!doc || !el) return
  error.value = ''
  if (props.pageNo < 1 || props.pageNo > doc.numPages) {
    error.value = `PDF に ${props.pageNo} ページ目がありません (全 ${doc.numPages} ページ)`
    return
  }
  task?.cancel()
  rendering.value = true
  try {
    const page = await doc.getPage(props.pageNo)
    const viewport = page.getViewport({ scale: props.scale })
    const ratio = window.devicePixelRatio || 1
    el.width = Math.floor(viewport.width * ratio)
    el.height = Math.floor(viewport.height * ratio)
    if (!props.fit) el.style.width = `${Math.floor(viewport.width)}px`
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

watch(() => [props.doc, props.pageNo, props.scale], render)
onMounted(render)
onBeforeUnmount(() => task?.cancel())
</script>

<template>
  <div class="space-y-1">
    <p v-if="error" class="text-sm text-(--ui-error)">{{ error }}</p>
    <div class="relative overflow-auto rounded border border-(--ui-border) bg-white">
      <canvas ref="canvas" class="block" :class="fit ? 'h-auto w-full' : 'max-w-none'" />
      <span v-if="rendering" class="absolute left-1 top-1 text-xs text-(--ui-text-muted)">描画中…</span>
    </div>
  </div>
</template>
