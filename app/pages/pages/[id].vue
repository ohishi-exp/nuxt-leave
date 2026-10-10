<script setup lang="ts">
import { errorMessage, isForbidden, type Employee, type LeavePageDetail, type PageStatus } from '~/utils/leave-api'
import { searchEmployees, toEmployeeOptions } from '~/utils/employees'
import {
  canSelectHalf,
  HALF_OPTIONS,
  linkFormFromPage,
  newPeriodRow,
  normalizePeriodRow,
  PERIOD_KINDS,
  toPageUpdateBody,
  validateLinkForm,
  type LinkForm,
} from '~/utils/leave-periods'
import { formatDateTime, nextUnlinkedId, statusLabel } from '~/utils/pages-list'

const api = useLeaveApi()
const route = useRoute()
const toast = useToast()

const id = computed(() => String(route.params.id))

const page = ref<LeavePageDetail | null>(null)
const pdf = ref<ArrayBuffer | null>(null)
const employees = ref<Employee[]>([])
const form = ref<LinkForm>({ employee_cd: '', note: '', periods: [] })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const forbidden = ref(false)
const pdfError = ref('')
const employeesError = ref('')
const formErrors = ref<string[]>([])
const searchTerm = ref('')

const employeeItems = computed(() =>
  toEmployeeOptions(searchEmployees(employees.value, searchTerm.value)),
)

async function load() {
  loading.value = true
  error.value = ''
  pdfError.value = ''
  formErrors.value = []
  page.value = null
  pdf.value = null
  try {
    const p = await api.getPage(id.value)
    page.value = p
    form.value = linkFormFromPage(p)
    if (form.value.periods.length === 0) form.value.periods.push(newPeriodRow())
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
    return
  }
  finally {
    loading.value = false
  }
  api.getPagePdf(id.value)
    .then((b) => { pdf.value = b })
    .catch((e) => { pdfError.value = errorMessage(e) })
}

async function loadEmployees() {
  try {
    employees.value = await api.listEmployees()
  }
  catch (e) {
    employeesError.value = errorMessage(e)
  }
}

function onDateChange(i: number) {
  const row = form.value.periods[i]
  if (row) form.value.periods[i] = normalizePeriodRow(row)
}

function addPeriod() {
  const last = form.value.periods.at(-1)
  form.value.periods.push(last ? { ...newPeriodRow(), kind: last.kind } : newPeriodRow())
}

function removePeriod(i: number) {
  form.value.periods.splice(i, 1)
}

async function goNext() {
  try {
    const list = await api.listPages({ status: 'unlinked', limit: 2, offset: 0 })
    const next = nextUnlinkedId(list, id.value)
    await navigateTo(next ? `/pages/${next}` : '/')
  }
  catch {
    await navigateTo('/')
  }
}

async function save(status: PageStatus) {
  // 対象外・未紐づけに戻すときは、空のまま (日付未入力) の期間行を送らない
  const f: LinkForm = status === 'linked'
    ? form.value
    : { ...form.value, periods: form.value.periods.filter(r => r.start_date !== '' || r.end_date !== '') }
  formErrors.value = validateLinkForm(f, status)
  if (formErrors.value.length > 0) return
  saving.value = true
  try {
    await api.updatePage(id.value, toPageUpdateBody(f, status))
    toast.add({ title: `${statusLabel(status)} にしました`, color: 'success' })
    await goNext()
  }
  catch (e) {
    formErrors.value = [errorMessage(e)]
  }
  finally {
    saving.value = false
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

    <div v-else-if="page" class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section class="space-y-2">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-(--ui-text-muted)">受信日時</dt>
          <dd>{{ formatDateTime(page.received_at) }}</dd>
          <dt class="text-(--ui-text-muted)">差出人</dt>
          <dd>{{ page.mail_from ?? '' }}</dd>
          <dt class="text-(--ui-text-muted)">件名</dt>
          <dd>{{ page.subject ?? '' }}</dd>
          <dt class="text-(--ui-text-muted)">状態</dt>
          <dd><UBadge :label="statusLabel(page.status)" variant="subtle" /></dd>
        </dl>
        <UAlert v-if="pdfError" color="error" :title="pdfError" />
        <ClientOnly v-else>
          <PdfPageCanvas :data="pdf" :page-no="page.page_no" />
        </ClientOnly>
      </section>

      <section class="space-y-4">
        <UFormField label="乗務員" required>
          <USelectMenu
            v-model="form.employee_cd"
            v-model:search-term="searchTerm"
            :items="employeeItems"
            value-key="value"
            label-key="label"
            ignore-filter
            placeholder="社員C か氏名で検索"
            class="w-full"
          />
          <p v-if="employeesError" class="mt-1 text-sm text-(--ui-error)">{{ employeesError }}</p>
        </UFormField>

        <div class="space-y-2">
          <div class="text-sm font-medium">期間</div>
          <div
            v-for="(row, i) in form.periods"
            :key="i"
            class="space-y-2 rounded border border-(--ui-border) bg-(--ui-bg) p-3"
          >
            <div class="flex flex-wrap items-end gap-2">
              <label class="text-sm">
                <span class="block text-(--ui-text-muted)">区分</span>
                <select v-model="row.kind" class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1">
                  <option v-for="k in PERIOD_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="block text-(--ui-text-muted)">開始日</span>
                <input
                  v-model="row.start_date"
                  type="date"
                  class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1"
                  @change="onDateChange(i)"
                >
              </label>
              <label class="text-sm">
                <span class="block text-(--ui-text-muted)">終了日</span>
                <input
                  v-model="row.end_date"
                  type="date"
                  class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1"
                  @change="onDateChange(i)"
                >
              </label>
              <label class="text-sm">
                <span class="block text-(--ui-text-muted)">半日</span>
                <select
                  v-model="row.half"
                  :disabled="!canSelectHalf(row)"
                  class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 disabled:opacity-50"
                >
                  <option v-for="h in HALF_OPTIONS" :key="h.value" :value="h.value">{{ h.label }}</option>
                </select>
              </label>
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="この期間を消す"
                @click="removePeriod(i)"
              />
            </div>
          </div>
          <UButton icon="i-lucide-plus" label="期間を追加" color="neutral" variant="outline" size="sm" @click="addPeriod" />
        </div>

        <UFormField label="備考">
          <UTextarea v-model="form.note" :rows="3" class="w-full" />
        </UFormField>

        <UAlert v-if="formErrors.length > 0" color="error" title="保存できません">
          <template #description>
            <ul class="list-disc pl-5">
              <li v-for="m in formErrors" :key="m">{{ m }}</li>
            </ul>
          </template>
        </UAlert>

        <div class="flex flex-wrap gap-2">
          <UButton label="紐づける" icon="i-lucide-link" :loading="saving" @click="save('linked')" />
          <UButton label="対象外にする" color="neutral" variant="outline" :disabled="saving" @click="save('ignored')" />
          <UButton label="未紐づけに戻す" color="neutral" variant="ghost" :disabled="saving" @click="save('unlinked')" />
        </div>
      </section>
    </div>
  </div>
</template>
