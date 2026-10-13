<script setup lang="ts">
import { DOC_TABS } from '~/utils/documents'
import { errorMessage, isForbidden, PAGE_LIMIT, type DocState, type LeaveDocument } from '~/utils/leave-api'
import { formatDateTime, hasNextPage, isTabValue, offsetFromQuery, tabFromQuery } from '~/utils/pages-list'

const api = useLeaveApi()
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

const canNext = computed(() => hasNextPage(docs.value.length, PAGE_LIMIT))

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">申請書 (PDF)</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <UTabs :items="tabItems" :model-value="state" :content="false" @update:model-value="onTab" />

      <UAlert v-if="error" color="error" :title="error" />

      <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
        <table class="w-full text-sm">
          <thead class="bg-(--ui-bg-elevated) text-left">
            <tr>
              <th class="px-3 py-2">受信日時</th>
              <th class="px-3 py-2">差出人</th>
              <th class="px-3 py-2">件名</th>
              <th class="px-3 py-2 text-right">ページ数</th>
              <th class="px-3 py-2 text-right">未紐づけ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="px-3 py-6 text-center text-(--ui-text-muted)">読み込み中…</td>
            </tr>
            <tr v-else-if="docs.length === 0">
              <td colspan="5" class="px-3 py-6 text-center text-(--ui-text-muted)">ありません</td>
            </tr>
            <tr
              v-for="d in docs"
              v-else
              :key="d.r2_key"
              class="cursor-pointer border-t border-(--ui-border) hover:bg-(--ui-bg-elevated)"
              @click="navigateTo(`/pages/${d.first_page_id}`)"
            >
              <td class="whitespace-nowrap px-3 py-2">{{ formatDateTime(d.received_at) }}</td>
              <td class="px-3 py-2">{{ d.mail_from ?? '' }}</td>
              <td class="px-3 py-2">{{ d.subject ?? '' }}</td>
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
