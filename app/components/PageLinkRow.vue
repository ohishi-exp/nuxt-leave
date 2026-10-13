<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Employee, LeavePage, LeavePeriod, PageStatus } from '~/utils/leave-api'
import {
  canSelectHalf,
  HALF_OPTIONS,
  linkFormFromPage,
  newPeriodRow,
  normalizePeriodRow,
  PERIOD_KINDS,
  validateLinkForm,
  type LinkForm,
} from '~/utils/leave-periods'
import { statusLabel } from '~/utils/pages-list'

/** 全ページ連続入力の 1 行 (縮小画像 + 紐づけフォーム)。保存は親が行う。 */
const props = defineProps<{
  page: LeavePage
  periods: LeavePeriod[]
  doc: PDFDocumentProxy | null
  employees: Employee[]
  saving: boolean
  /** 保存に失敗したときの文 (この行にだけ出す) */
  error: string
  /** 期間の読み込みに失敗した行 (空のまま保存して期間を消さないよう、保存を止める) */
  loadError: string
}>()

const emit = defineEmits<{
  save: [status: PageStatus, form: LinkForm]
  reload: []
}>()

const root = ref<HTMLElement | null>(null)
const zoomOpen = ref(false)
const formErrors = ref<string[]>([])

function initialForm(): LinkForm {
  const f = linkFormFromPage({ employee_cd: props.page.employee_cd, note: props.page.note, periods: props.periods })
  if (f.periods.length === 0) f.periods.push(newPeriodRow())
  return f
}

const form = ref<LinkForm>(initialForm())

// 保存・再取得で page / periods が差し替わったら、フォームも保存された値に合わせる
watch(() => [props.page, props.periods], () => {
  form.value = initialForm()
})

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

function submit(status: PageStatus) {
  if (props.loadError) return
  // 対象外・未紐づけに戻すときは、空のまま (日付未入力) の期間行を送らない
  const f: LinkForm = status === 'linked'
    ? form.value
    : { ...form.value, periods: form.value.periods.filter(r => r.start_date !== '' || r.end_date !== '') }
  formErrors.value = validateLinkForm(f, status)
  if (formErrors.value.length > 0) return
  emit('save', status, f)
}

/** 次の行へ進んだとき: 見える位置へ寄せて乗務員欄にフォーカスする */
function focusEmployee() {
  root.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  root.value?.querySelector<HTMLElement>('[data-employee] button, [data-employee] input')?.focus({ preventScroll: true })
}

function scrollHere() {
  root.value?.scrollIntoView({ block: 'center' })
}

defineExpose({ focusEmployee, scrollHere })
</script>

<template>
  <div
    ref="root"
    class="grid gap-4 rounded-lg border p-3 md:grid-cols-[15rem_minmax(0,1fr)]"
    :class="page.status === 'unlinked' ? 'border-(--ui-border) bg-(--ui-bg)' : 'border-(--ui-border) bg-(--ui-bg-elevated)'"
  >
    <div class="space-y-1">
      <div class="flex items-center gap-2 text-sm">
        <span class="font-medium">{{ page.page_no }} ページ目</span>
        <UBadge
          :label="statusLabel(page.status)"
          :color="page.status === 'linked' ? 'success' : page.status === 'ignored' ? 'neutral' : 'warning'"
          variant="subtle"
        />
      </div>
      <button
        type="button"
        class="block w-full text-left"
        :aria-label="`${page.page_no} ページ目を拡大`"
        @click="zoomOpen = true"
      >
        <ClientOnly>
          <PdfPageCanvas :doc="doc" :page-no="page.page_no" :scale="0.4" />
        </ClientOnly>
      </button>
      <UModal v-model:open="zoomOpen" :title="`${page.page_no} ページ目`">
        <template #body>
          <PdfPageCanvas :doc="doc" :page-no="page.page_no" :scale="1.5" />
        </template>
      </UModal>
    </div>

    <div class="space-y-3">
      <UFormField label="乗務員" required>
        <div data-employee>
          <EmployeeSelect v-model="form.employee_cd" :employees="employees" />
        </div>
      </UFormField>

      <div class="space-y-2">
        <div class="text-sm font-medium">期間</div>
        <div
          v-for="(row, i) in form.periods"
          :key="i"
          class="flex flex-wrap items-end gap-2 rounded border border-(--ui-border) p-2"
        >
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
        <UButton icon="i-lucide-plus" label="期間を追加" color="neutral" variant="outline" size="xs" @click="addPeriod" />
      </div>

      <UFormField label="備考">
        <UTextarea v-model="form.note" :rows="2" class="w-full" />
      </UFormField>

      <UAlert v-if="formErrors.length > 0 || error" color="error" title="保存できません">
        <template #description>
          <ul class="list-disc pl-5">
            <li v-for="m in formErrors" :key="m">{{ m }}</li>
            <li v-if="error">{{ error }}</li>
          </ul>
        </template>
      </UAlert>

      <UAlert v-if="loadError" color="warning" title="この行の読み込みに失敗しました" :description="loadError">
        <template #actions>
          <UButton label="再読み込み" icon="i-lucide-refresh-cw" color="neutral" variant="outline" size="xs" :loading="saving" @click="emit('reload')" />
        </template>
      </UAlert>

      <div class="flex flex-wrap gap-2">
        <UButton label="紐づける" icon="i-lucide-link" :loading="saving" :disabled="!!loadError" @click="submit('linked')" />
        <UButton label="対象外" color="neutral" variant="outline" :disabled="saving || !!loadError" @click="submit('ignored')" />
        <UButton label="未紐づけに戻す" color="neutral" variant="ghost" :disabled="saving || !!loadError" @click="submit('unlinked')" />
      </div>
    </div>
  </div>
</template>
