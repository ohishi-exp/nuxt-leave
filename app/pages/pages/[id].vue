<script setup lang="ts">
import { nextUnlinkedIndex } from '~/utils/documents'
import {
  errorMessage,
  isForbidden,
  type Employee,
  type LeavePage,
  type LeavePeriod,
  type PageStatus,
} from '~/utils/leave-api'
import { toPageUpdateBody, type LinkForm } from '~/utils/leave-periods'
import { formatDateTime, statusLabel } from '~/utils/pages-list'

/** 1 PDF の全ページ。保存は 1 行 (1 ページ) ずつ。 */
interface Row {
  page: LeavePage
  periods: LeavePeriod[]
  saving: boolean
  error: string
}

interface RowHandle {
  focusEmployee: () => void
  scrollHere: () => void
}

const api = useLeaveApi()
const route = useRoute()
const toast = useToast()

const id = computed(() => String(route.params.id))

const rows = ref<Row[]>([])
const pdf = ref<ArrayBuffer | null>(null)
const employees = ref<Employee[]>([])
const loading = ref(false)
const error = ref('')
const forbidden = ref(false)
const pdfError = ref('')
const employeesError = ref('')
const rowRefs = new Map<string, RowHandle>()

const { doc, error: openError } = usePdfDoc(pdf)

const head = computed(() => rows.value[0]?.page ?? null)
const unlinkedCount = computed(() => rows.value.filter(r => r.page.status === 'unlinked').length)
const finished = computed(() => rows.value.length > 0 && unlinkedCount.value === 0)

function setRowRef(pageId: string, el: unknown) {
  if (el) rowRefs.set(pageId, el as RowHandle)
  else rowRefs.delete(pageId)
}

async function load() {
  loading.value = true
  error.value = ''
  pdfError.value = ''
  rows.value = []
  pdf.value = null
  try {
    const first = await api.getPage(id.value)
    // PDF 全体は 1 回だけ取り、全行の縮小画像で共有する
    api.getPagePdf(id.value)
      .then((b) => { pdf.value = b })
      .catch((e) => { pdfError.value = errorMessage(e) })
    const list = await api.listPages({ r2_key: first.r2_key, limit: 200 })
    // 一覧の行には期間が無い。紐づけ済み・対象外の行だけ、期間を取って初期値にする
    rows.value = await Promise.all(list.map(async (p): Promise<Row> => {
      let periods: LeavePeriod[] = []
      if (p.id === first.id) periods = first.periods
      else if (p.status !== 'unlinked') {
        try {
          periods = (await api.getPage(p.id)).periods
        }
        catch {
          periods = []
        }
      }
      return { page: p, periods, saving: false, error: '' }
    }))
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
    return
  }
  finally {
    loading.value = false
  }
  await nextTick()
  rowRefs.get(id.value)?.scrollHere()
}

async function loadEmployees() {
  try {
    employees.value = await api.listEmployees()
  }
  catch (e) {
    employeesError.value = errorMessage(e)
  }
}

async function onSave(index: number, status: PageStatus, form: LinkForm) {
  const row = rows.value[index]
  if (!row) return
  row.saving = true
  row.error = ''
  try {
    const saved = await api.updatePage(row.page.id, toPageUpdateBody(form, status))
    row.page = saved
    row.periods = saved.periods
    toast.add({ title: `${row.page.page_no} ページ目を${statusLabel(status)}にしました`, color: 'success' })
    const next = nextUnlinkedIndex(rows.value.map(r => r.page), index)
    const target = next === null ? undefined : rows.value[next]
    await nextTick()
    if (target) rowRefs.get(target.page.id)?.focusEmployee()
  }
  catch (e) {
    row.error = errorMessage(e)
  }
  finally {
    row.saving = false
  }
}

watch(id, load)
onMounted(() => {
  load()
  loadEmployees()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UButton to="/" icon="i-lucide-arrow-left" label="一覧へ" color="neutral" variant="ghost" size="sm" />
      <h1 class="text-xl font-bold">申請書の紐づけ</h1>
    </div>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />
    <UAlert v-else-if="error" color="error" :title="error" />
    <div v-else-if="loading" class="text-(--ui-text-muted)">読み込み中…</div>

    <template v-else-if="head">
      <section class="space-y-2">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-(--ui-text-muted)">受信日時</dt>
          <dd>{{ formatDateTime(head.received_at) }}</dd>
          <dt class="text-(--ui-text-muted)">差出人</dt>
          <dd>{{ head.mail_from ?? '' }}</dd>
          <dt class="text-(--ui-text-muted)">件名</dt>
          <dd>{{ head.subject ?? '' }}</dd>
          <dt class="text-(--ui-text-muted)">進み具合</dt>
          <dd>全 {{ rows.length }} ページ中 未紐づけ {{ unlinkedCount }}</dd>
        </dl>
        <UAlert v-if="pdfError" color="error" :title="pdfError" />
        <UAlert v-if="openError" color="error" :title="openError" />
        <UAlert v-if="employeesError" color="error" :title="employeesError" />
        <UAlert
          v-if="finished"
          color="success"
          icon="i-lucide-circle-check"
          title="この PDF は完了"
        >
          <template #actions>
            <UButton to="/" label="一覧へ" color="neutral" variant="outline" size="sm" />
          </template>
        </UAlert>
      </section>

      <div class="space-y-3">
        <PageLinkRow
          v-for="(r, i) in rows"
          :key="r.page.id"
          :ref="(el) => setRowRef(r.page.id, el)"
          :page="r.page"
          :periods="r.periods"
          :doc="doc"
          :employees="employees"
          :saving="r.saving"
          :error="r.error"
          @save="(status, form) => onSave(i, status, form)"
        />
      </div>

      <div v-if="finished" class="flex justify-end">
        <UButton to="/" label="一覧へ" icon="i-lucide-arrow-left" />
      </div>
    </template>
  </div>
</template>
