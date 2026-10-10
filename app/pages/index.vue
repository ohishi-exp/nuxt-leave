<script setup lang="ts">
import { errorMessage, isForbidden, PAGE_LIMIT, type LeavePage, type PageStatus } from '~/utils/leave-api'
import { formatDateTime, hasNextPage, isPageStatus, STATUS_TABS } from '~/utils/pages-list'

const api = useLeaveApi()
const route = useRoute()
const router = useRouter()

const status = ref<PageStatus>(isPageStatus(route.query.status) ? route.query.status : 'unlinked')
const offset = ref(Number(route.query.offset) > 0 ? Number(route.query.offset) : 0)
const pages = ref<LeavePage[]>([])
const loading = ref(false)
const error = ref('')
const forbidden = ref(false)

const tabItems = STATUS_TABS.map(t => ({ label: t.label, value: t.value }))

async function load() {
  loading.value = true
  error.value = ''
  try {
    pages.value = await api.listPages({ status: status.value, limit: PAGE_LIMIT, offset: offset.value })
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
    pages.value = []
  }
  finally {
    loading.value = false
  }
}

watch([status, offset], () => {
  router.replace({ query: { status: status.value, offset: offset.value > 0 ? offset.value : undefined } })
  load()
})

function onTab(v: string | number) {
  if (isPageStatus(v)) {
    offset.value = 0
    status.value = v
  }
}

const canNext = computed(() => hasNextPage(pages.value.length, PAGE_LIMIT))

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">申請書のページ</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <UTabs :items="tabItems" :model-value="status" :content="false" @update:model-value="onTab" />

      <UAlert v-if="error" color="error" :title="error" />

      <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
        <table class="w-full text-sm">
          <thead class="bg-(--ui-bg-elevated) text-left">
            <tr>
              <th class="px-3 py-2">受信日時</th>
              <th class="px-3 py-2">差出人</th>
              <th class="px-3 py-2">件名</th>
              <th class="px-3 py-2 text-right">ページ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="px-3 py-6 text-center text-(--ui-text-muted)">読み込み中…</td>
            </tr>
            <tr v-else-if="pages.length === 0">
              <td colspan="4" class="px-3 py-6 text-center text-(--ui-text-muted)">ありません</td>
            </tr>
            <tr
              v-for="p in pages"
              v-else
              :key="p.id"
              class="cursor-pointer border-t border-(--ui-border) hover:bg-(--ui-bg-elevated)"
              @click="navigateTo(`/pages/${p.id}`)"
            >
              <td class="whitespace-nowrap px-3 py-2">{{ formatDateTime(p.received_at) }}</td>
              <td class="px-3 py-2">{{ p.mail_from ?? '' }}</td>
              <td class="px-3 py-2">{{ p.subject ?? '' }}</td>
              <td class="px-3 py-2 text-right">{{ p.page_no }}</td>
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
