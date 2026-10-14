<script setup lang="ts">
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Employee, IchibanCandidatePeriod, LeavePage, LeavePeriod, PageStatus } from '~/utils/leave-api'
import {
  candidateKey,
  initialCheckedKeys,
  isRowDirty,
  periodLabel,
  rowButtons,
  rowKeyAction,
  selectedPeriods,
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

function initialForm() {
  return { employee_cd: props.page.employee_cd ?? '', note: props.page.note ?? '' }
}

const form = ref(initialForm())
/** props 由来の作り直しで入った employee_cd (次の watch 1 回だけ候補を引かない) */
let syncedCd: string | null = null

const api = useLeaveApi()
const candidateNotice = ref('')
/** 一番星の候補 (乗務員の欄の下に並べ、チェックしたものが期間になる) */
const candidates = ref<IchibanCandidatePeriod[]>([])
const checked = ref<string[]>([])
/** 行を開いたとき (props から form を作り直したとき) の値。ボタンの出し分けの基準 */
const initial = ref({ ...form.value, checked: [] as string[] })
const buttons = computed(() => rowButtons(
  props.page.status,
  isRowDirty(initial.value, { ...form.value, checked: checked.value }),
))

// 保存・再取得で page / periods が差し替わったら、フォームも保存された値に合わせる
watch(() => [props.page, props.periods], () => {
  const next = initialForm()
  // 作り直しで employee_cd が変わる分は、乗務員を選んだ操作ではないので候補を引かない
  if (next.employee_cd !== form.value.employee_cd) syncedCd = next.employee_cd
  form.value = next
  checked.value = []
  initial.value = { ...next, checked: [] }
})

/** 乗務員を選んだら一番星の候補を引く。1 つだけなら最初からチェックし、2 つ以上は選んでもらう */
async function fetchCandidates(cd: string, focus = true) {
  try {
    const res = await api.getCandidates(props.page.id, cd)
    if (form.value.employee_cd !== cd) return
    candidates.value = res.periods
    checked.value = initialCheckedKeys(res.periods, props.periods)
    if (res.periods.length === 0) {
      candidateNotice.value = '一番星に記録がありません。一番星に記録を足してから選んでください'
      return
    }
    // 乗務員を確定して候補が返ったら、キーボードだけで続けられるよう候補一覧へフォーカスを移す
    // (基準日が変わった引き直しでは動かさない)
    if (!focus) return
    await nextTick()
    focusCandidates()
  }
  catch {
    if (form.value.employee_cd !== cd) return
    candidateNotice.value = '一番星を読めませんでした'
  }
}

// 乗務員を選び直したら一番星の候補を取り直す。
// props 由来の form 作り直しでは employee_cd の変化を拾わない (保存済みの期間はそのまま)
watch(() => form.value.employee_cd, async (cd, old) => {
  candidateNotice.value = ''
  candidates.value = []
  checked.value = []
  if (cd === syncedCd) {
    syncedCd = null
    return
  }
  if (cd === '' || cd === old) return
  await fetchCandidates(cd)
})

// 基準日が変わったら候補を引き直す (チェックは初期規則でやり直し、保存済みの期間はそのまま)
watch(() => props.page.base_date, async () => {
  const cd = form.value.employee_cd
  if (cd === '') return
  await fetchCandidates(cd, false)
})

function submit(status: PageStatus) {
  if (props.loadError || props.saving) return
  const f: LinkForm = {
    ...form.value,
    ...selectedPeriods(checked.value, candidates.value, props.periods),
  }
  formErrors.value = validateLinkForm(f, status)
  if (formErrors.value.length > 0) return
  emit('save', status, f)
}

function candidateBoxes(): HTMLInputElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLInputElement>('[data-candidates] input[type=checkbox]') ?? [])
}

/** 候補一覧の、今チェックの付いている最初の行 (無ければ先頭) にフォーカスする */
function focusCandidates() {
  const boxes = candidateBoxes()
  const target = boxes.find(b => b.checked) ?? boxes[0]
  target?.focus()
}

/** キー操作 (判定は rowKeyAction)。備考など他の入力欄の中では何もしない */
function onKeydown(ev: KeyboardEvent) {
  const el = ev.target as HTMLElement
  const zone = el.closest('[data-candidates]') ? 'candidates' : el.closest('[data-employee]') ? 'employee' : 'other'
  const boxes = candidateBoxes()
  const act = rowKeyAction({
    key: ev.key,
    ctrlKey: ev.ctrlKey,
    metaKey: ev.metaKey,
    zone,
    menuOpen: el.getAttribute('aria-expanded') === 'true',
    candidateCount: boxes.length,
  })
  if (!act || ev.isComposing) return
  ev.preventDefault()
  if (act.type === 'link') {
    if (buttons.value.includes('link') || buttons.value.includes('relink')) submit('linked')
  }
  else if (act.type === 'ignore') {
    if (buttons.value.includes('ignore')) submit('ignored')
  }
  else if (act.type === 'focusCandidates') focusCandidates()
  else if (act.type === 'toggle') boxes[act.index]?.click()
  else if (act.type === 'toggle-focused') (el as HTMLInputElement).click()
  else {
    const at = Math.max(0, boxes.indexOf(el as HTMLInputElement) + act.delta)
    boxes[Math.min(at, boxes.length - 1)]?.focus()
  }
}

/** 次の行へ進んだとき: 行の上端を画面の上に合わせて乗務員欄にフォーカスする */
function focusEmployee() {
  root.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  root.value?.querySelector<HTMLElement>('[data-employee] button, [data-employee] input')?.focus({ preventScroll: true })
}

function scrollHere() {
  root.value?.scrollIntoView({ block: 'start' })
}

defineExpose({ focusEmployee, scrollHere })
</script>

<template>
  <div
    ref="root"
    class="scroll-mt-16 grid gap-4 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_28rem]"
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
          <PdfPageCanvas :doc="doc" :page-no="page.page_no" :scale="1.5" fit />
        </ClientOnly>
      </button>
      <UModal v-model:open="zoomOpen" :title="`${page.page_no} ページ目`">
        <template #body>
          <PdfPageCanvas :doc="doc" :page-no="page.page_no" :scale="1.5" />
        </template>
      </UModal>
    </div>

    <div class="space-y-3" @keydown="onKeydown">
      <UFormField label="乗務員" required>
        <div data-employee>
          <EmployeeSelect v-model="form.employee_cd" :employees="employees" />
        </div>
      </UFormField>

      <div class="space-y-2 rounded border border-(--ui-border) p-2">
        <div class="text-sm font-medium">一番星の候補</div>
        <div v-if="periods.length > 0" class="text-sm">
          <div class="text-xs text-(--ui-text-muted)">保存済み</div>
          <div v-for="(p, i) in periods" :key="i">{{ periodLabel(p) }}</div>
        </div>
        <div v-if="candidates.length > 0" data-candidates class="space-y-1">
          <label v-for="(p, n) in candidates" :key="candidateKey(p)" class="flex items-center gap-2 text-sm">
            <input v-model="checked" type="checkbox" :value="candidateKey(p)">
            <span><span v-if="n < 9" class="text-(--ui-text-muted)">{{ n + 1 }}.</span> {{ periodLabel(p) }}</span>
          </label>
          <p v-if="page.status === 'unlinked'" class="text-xs text-(--ui-text-muted)">乗務員 Enter で候補へ / ↑↓ 移動 / Space・数字 選択 / Enter 紐づける / Ctrl+Enter 対象外</p>
          <p v-else class="text-xs text-(--ui-text-muted)">乗務員 Enter で候補へ / ↑↓ 移動 / Space・数字 選択 / Enter 紐づけ直す (変えたときだけ)</p>
        </div>
        <UButton
          v-if="form.employee_cd !== '' && candidates.length === 0 && !candidateNotice"
          label="候補を読み込む"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="xs"
          @click="fetchCandidates(form.employee_cd)"
        />
        <p v-if="form.employee_cd === ''" class="text-xs text-(--ui-text-muted)">乗務員を選ぶと一番星の候補が出ます</p>
      </div>

      <UFormField label="備考">
        <UTextarea v-model="form.note" :rows="2" class="w-full" />
      </UFormField>

      <UAlert v-if="candidateNotice" color="warning" :description="candidateNotice" />

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
        <UButton v-if="buttons.includes('link')" label="紐づける" icon="i-lucide-link" :loading="saving" :disabled="!!loadError" @click="submit('linked')" />
        <UButton v-if="buttons.includes('relink')" label="紐づけ直す" icon="i-lucide-link" :loading="saving" :disabled="!!loadError" @click="submit('linked')" />
        <UButton v-if="buttons.includes('ignore')" label="対象外" color="neutral" variant="outline" :disabled="saving || !!loadError" @click="submit('ignored')" />
        <UButton v-if="buttons.includes('unlink')" label="未紐づけに戻す" color="neutral" variant="ghost" :disabled="saving || !!loadError" @click="submit('unlinked')" />
      </div>
    </div>
  </div>
</template>
