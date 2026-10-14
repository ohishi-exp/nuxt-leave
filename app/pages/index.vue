<script setup lang="ts">
import { DOC_TABS } from '~/utils/documents'
import { errorMessage, isForbidden, PAGE_LIMIT, type DocState, type LeaveDocument } from '~/utils/leave-api'
import { effectiveBaseDate, formatDateTime, hasNextPage, isTabValue, offsetFromQuery, tabFromQuery } from '~/utils/pages-list'
import { checkPdfFile } from '~/utils/upload'

const api = useLeaveApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const state = ref<DocState>(tabFromQuery(DOC_TABS, route.query.state, 'open'))
const offset = ref(offsetFromQuery(route.query.offset))
const docs = ref<LeaveDocument[]>([])
const loading = ref(false)
const error = ref('')
const forbidden = ref(false)

const tabItems = DOC_TABS.map(t => ({ label: t.label, value: t.value }))

async function load() {
  loading.value = true
  error.value = ''
  try {
    docs.value = await api.listDocuments({ state: state.value, limit: PAGE_LIMIT, offset: offset.value })
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
    docs.value = []
  }
  finally {
    loading.value = false
  }
}

watch([state, offset], () => {
  router.replace({ query: { state: state.value, offset: offset.value > 0 ? offset.value : undefined } })
  load()
})

function onTab(v: string | number) {
  if (isTabValue(DOC_TABS, v)) {
    offset.value = 0
    state.value = v
  }
}

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

/** 選んだ PDF を 1 つずつ順に取り込む (同じファイルでも毎回取り込む) */
async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0 || uploading.value) return
  uploading.value = true
  let ok = 0
  let pages = 0
  const failures: string[] = []
  try {
    for (const f of files) {
      const bad = checkPdfFile(f)
      if (bad) {
        failures.push(`${f.name}: ${bad}`)
        continue
      }
      try {
        const r = await api.uploadPdf(f)
        ok += 1
        pages += r.pages
      }
      catch (e) {
        failures.push(`${f.name}: ${errorMessage(e)}`)
      }
    }
  }
  finally {
    uploading.value = false
  }
  toast.add({
    title: ok > 0 ? `${ok} 件取り込みました (計 ${pages} ページ)` : '取り込めませんでした',
    description: failures.length > 0 ? failures.join('\n') : undefined,
    color: ok === 0 ? 'error' : failures.length > 0 ? 'warning' : 'success',
    duration: failures.length > 0 ? 0 : undefined,
  })
  await load()
}

const canNext = computed(() => hasNextPage(docs.value.length, PAGE_LIMIT))

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">申請書 (PDF)</h1>
      <UButton
        label="PDF を取り込む"
        icon="i-lucide-upload"
        :loading="uploading"
        :disabled="uploading"
        @click="fileInput?.click()"
      />
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        class="hidden"
        @change="onFiles"
      >
    </div>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <UTabs :items="tabItems" :model-value="state" :content="false" @update:model-value="onTab" />

      <UAlert v-if="error" color="error" :title="error" />

      <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
        <table class="w-full text-sm">
          <thead class="bg-(--ui-bg-elevated) text-left">
            <tr>
              <th class="px-3 py-2">受信日時</th>
              <th class="px-3 py-2">基準日</th>
              <th class="px-3 py-2 text-right">ページ数</th>
              <th class="px-3 py-2 text-right">未紐づけ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="px-3 py-6 text-center text-(--ui-text-muted)">読み込み中…</td>
            </tr>
            <tr v-else-if="docs.length === 0">
              <td colspan="4" class="px-3 py-6 text-center text-(--ui-text-muted)">ありません</td>
            </tr>
            <tr
              v-for="d in docs"
              v-else
              :key="d.r2_key"
              class="cursor-pointer border-t border-(--ui-border) hover:bg-(--ui-bg-elevated)"
              @click="navigateTo(`/pages/${d.first_page_id}`)"
            >
              <td class="whitespace-nowrap px-3 py-2">{{ formatDateTime(d.received_at) }}</td>
              <td class="whitespace-nowrap px-3 py-2">
                {{ effectiveBaseDate(d) }}<span v-if="d.base_date === null" class="text-(--ui-text-muted)">（受信日）</span>
              </td>
              <td class="px-3 py-2 text-right">{{ d.page_count }}</td>
              <td class="px-3 py-2 text-right">{{ d.unlinked_count }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <UButton
          label="前へ"
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          :disabled="offset === 0 || loading"
          @click="offset = Math.max(0, offset - PAGE_LIMIT)"
        />
        <span class="text-sm text-(--ui-text-muted)">{{ offset + 1 }} 件目から</span>
        <UButton
          label="次へ"
          trailing-icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          :disabled="!canNext || loading"
          @click="offset = offset + PAGE_LIMIT"
        />
      </div>
    </template>
  </div>
</template>
