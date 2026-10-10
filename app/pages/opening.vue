<script setup lang="ts">
import { errorMessage, isForbidden, type Department, type OpeningRow } from '~/utils/leave-api'
import { employeeLabel } from '~/utils/employees'
import { formatDays } from '~/utils/grants'
import {
  applyPaste,
  buildInputs,
  deptOptions,
  filterOpeningRows,
  OPENING_MAX_ROWS,
  parsePaste,
  planSave,
  todayIso,
  type OpeningInputs,
  type PasteResult,
} from '~/utils/opening'

const api = useLeaveApi()
const toast = useToast()

const rows = ref<OpeningRow[]>([])
const departments = ref<Department[]>([])
const inputs = ref<OpeningInputs>({})
const asOf = ref(todayIso())
const restamp = ref(false)
const dept = ref('')
const query = ref('')
const pasteText = ref('')
const pasteResult = ref<PasteResult | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const forbidden = ref(false)

const plan = computed(() => planSave(rows.value, inputs.value, asOf.value, restamp.value))
const issueByCode = computed(() => new Map(plan.value.issues.map(i => [i.employee_cd, i.message])))
const dirtyCodes = computed(() => new Set(plan.value.rows.map(r => r.employee_cd)))
const visible = computed(() => filterOpeningRows(rows.value, { dept: dept.value, query: query.value }))
const deptItems = computed(() => deptOptions(rows.value, departments.value))
const canSave = computed(() =>
  plan.value.rows.length > 0 && plan.value.issues.length === 0
  && plan.value.asOfError === null && !plan.value.tooMany && !saving.value,
)

function rowLabel(r: OpeningRow): string {
  return employeeLabel({
    employee_code: r.employee_cd,
    employee_name: r.employee_name,
    retire_date: r.retire_date,
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await api.listOpening()
    inputs.value = buildInputs(rows.value)
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
    return
  }
  finally {
    loading.value = false
  }
  try {
    departments.value = await api.listDepartments()
  }
  catch {
    departments.value = []
  }
}

function setInput(code: string, field: 'carryover' | 'current', e: Event) {
  const cur = inputs.value[code] ?? { carryover: '', current: '' }
  inputs.value = { ...inputs.value, [code]: { ...cur, [field]: (e.target as HTMLInputElement).value } }
}

function applyPasted() {
  const r = parsePaste(pasteText.value, rows.value.map(x => x.employee_cd))
  pasteResult.value = r
  inputs.value = applyPaste(inputs.value, r.entries)
  if (r.unknown.length === 0 && r.invalid.length === 0) pasteText.value = ''
}

function resetInputs() {
  inputs.value = buildInputs(rows.value)
  pasteResult.value = null
}

async function save() {
  const p = plan.value
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  try {
    const r = await api.saveOpening({ as_of: asOf.value, rows: p.rows })
    toast.add({ title: `保存 ${r.saved} 件、削除 ${r.deleted} 件`, color: 'success' })
    pasteResult.value = null
    await load()
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">有給の期首残</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <p class="text-sm text-(--ui-text-muted)">
        期首日時点の残を、前年からの繰越と今年度の付与の残に分けて入れます。両方空にして保存するとその人の期首残を消します。
        期首日までの消化は期首残に含まれているものとして、翌日以降だけを数えます。
      </p>

      <UAlert v-if="error" color="error" :title="error" />

      <section class="space-y-3 rounded border border-(--ui-border) bg-(--ui-bg) p-3">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="期首日">
            <input
              v-model="asOf"
              type="date"
              class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
            >
          </UFormField>
          <UFormField label="部門">
            <select
              v-model="dept"
              class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
            >
              <option value="">すべて</option>
              <option v-for="d in deptItems" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
          </UFormField>
          <UFormField label="社員C・氏名">
            <UInput v-model="query" placeholder="絞り込み" />
          </UFormField>
          <label class="flex items-center gap-1 pb-2 text-sm">
            <input v-model="restamp" type="checkbox">
            値が同じでも期首日が違う保存済みの行を今の期首日で保存し直す
          </label>
        </div>
        <p v-if="plan.asOfError" class="text-sm text-(--ui-error)">{{ plan.asOfError }}</p>
      </section>

      <section class="space-y-2 rounded border border-(--ui-border) bg-(--ui-bg) p-3">
        <div class="text-sm font-medium">Excel から貼り付け</div>
        <p class="text-xs text-(--ui-text-muted)">
          「社員C・繰越・今年度」の列を貼ります (タブかカンマ区切り。見出し行・空行は無視)。表に反映するだけで、保存は下のボタンです。
        </p>
        <textarea
          v-model="pasteText"
          rows="4"
          class="w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 font-mono text-sm"
          placeholder="1021&#9;12.5&#9;10"
        />
        <div>
          <UButton label="表に反映" color="neutral" variant="outline" :disabled="pasteText.trim() === ''" @click="applyPasted" />
        </div>
        <div v-if="pasteResult" class="space-y-1 text-sm">
          <p>{{ pasteResult.entries.length }} 行を表に反映しました。</p>
          <p v-if="pasteResult.unknown.length > 0" class="text-(--ui-error)">
            一覧に無い社員C (無視しました): {{ pasteResult.unknown.join('、') }}
          </p>
          <div v-if="pasteResult.invalid.length > 0" class="text-(--ui-error)">
            日数が読めない行 (無視しました):
            <ul class="list-disc pl-5 font-mono">
              <li v-for="l in pasteResult.invalid" :key="l">{{ l }}</li>
            </ul>
          </div>
        </div>
      </section>

      <div class="flex flex-wrap items-center gap-3">
        <UButton icon="i-lucide-save" :label="`変更した ${plan.rows.length} 行を保存`" :disabled="!canSave" :loading="saving" @click="save" />
        <UButton label="入力を戻す" color="neutral" variant="outline" :disabled="saving" @click="resetInputs" />
        <span v-if="plan.issues.length > 0" class="text-sm text-(--ui-error)">日数が正しくない行が {{ plan.issues.length }} 行あります</span>
        <span v-if="plan.tooMany" class="text-sm text-(--ui-error)">一度に保存できるのは {{ OPENING_MAX_ROWS }} 人までです</span>
      </div>

      <p v-if="loading" class="text-sm text-(--ui-text-muted)">読み込み中…</p>

      <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
        <table class="w-full text-sm">
          <thead class="bg-(--ui-bg-elevated) text-left">
            <tr>
              <th class="px-3 py-2">社員C・氏名</th>
              <th class="px-3 py-2">部門</th>
              <th class="px-3 py-2">入社日</th>
              <th class="px-3 py-2">繰越 (日)</th>
              <th class="px-3 py-2">今年度 (日)</th>
              <th class="px-3 py-2">保存済み</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="visible.length === 0">
              <td colspan="6" class="px-3 py-6 text-center text-(--ui-text-muted)">該当する乗務員がいません</td>
            </tr>
            <tr
              v-for="r in visible"
              :key="r.employee_cd"
              class="border-t border-(--ui-border)"
              :class="{ 'bg-(--ui-bg-elevated)/60': dirtyCodes.has(r.employee_cd) }"
            >
              <td class="whitespace-nowrap px-3 py-2">{{ rowLabel(r) }}</td>
              <td class="px-3 py-2">{{ r.dept_code ?? '' }}</td>
              <td class="whitespace-nowrap px-3 py-2">{{ r.hire_date ?? '未登録' }}</td>
              <td class="px-3 py-2">
                <input
                  :value="inputs[r.employee_cd]?.carryover ?? ''"
                  type="text"
                  inputmode="decimal"
                  class="w-24 rounded border bg-(--ui-bg) px-2 py-1 text-right"
                  :class="issueByCode.has(r.employee_cd) ? 'border-(--ui-error)' : 'border-(--ui-border)'"
                  @input="setInput(r.employee_cd, 'carryover', $event)"
                >
              </td>
              <td class="px-3 py-2">
                <input
                  :value="inputs[r.employee_cd]?.current ?? ''"
                  type="text"
                  inputmode="decimal"
                  class="w-24 rounded border bg-(--ui-bg) px-2 py-1 text-right"
                  :class="issueByCode.has(r.employee_cd) ? 'border-(--ui-error)' : 'border-(--ui-border)'"
                  @input="setInput(r.employee_cd, 'current', $event)"
                >
                <div v-if="issueByCode.has(r.employee_cd)" class="text-xs text-(--ui-error)">{{ issueByCode.get(r.employee_cd) }}</div>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-(--ui-text-muted)">
                <template v-if="r.opening">
                  {{ r.opening.as_of }} 時点: 繰越 {{ formatDays(r.opening.carryover) }} / 今年度 {{ formatDays(r.opening.current) }}
                </template>
                <template v-else>未入力</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
