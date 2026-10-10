<script setup lang="ts">
import { errorMessage, isForbidden, type GrantsResponse, type LeaveGrant } from '~/utils/leave-api'
import {
  autoResultMessage,
  BALANCE_NOTE,
  editNotice,
  emptyGrantForm,
  formatDays,
  grantFormFromGrant,
  sourceLabel,
  toCreateBody,
  toUpdateBody,
  validateGrantForm,
  type GrantForm,
} from '~/utils/grants'

const api = useLeaveApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const employeeCd = ref(typeof route.query.employee_cd === 'string' ? route.query.employee_cd : '')
const data = ref<GrantsResponse | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const forbidden = ref(false)

/** 編集中の行 (null = 新規、undefined = フォームを閉じている) */
const editing = ref<LeaveGrant | null | undefined>(undefined)
const form = ref<GrantForm>(emptyGrantForm())
const formErrors = ref<string[]>([])
const deleting = ref<LeaveGrant | null>(null)

const showForm = computed(() => editing.value !== undefined)

async function load() {
  error.value = ''
  if (employeeCd.value === '') {
    data.value = null
    return
  }
  loading.value = true
  try {
    data.value = await api.listGrants(employeeCd.value)
  }
  catch (e) {
    data.value = null
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
  }
  finally {
    loading.value = false
  }
}

watch(employeeCd, () => {
  editing.value = undefined
  router.replace({ query: { employee_cd: employeeCd.value || undefined } })
  load()
})

function openCreate() {
  editing.value = null
  form.value = emptyGrantForm()
  formErrors.value = []
}

function openEdit(g: LeaveGrant) {
  editing.value = g
  form.value = grantFormFromGrant(g)
  formErrors.value = []
}

async function run(fn: () => Promise<void>) {
  saving.value = true
  error.value = ''
  try {
    await fn()
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    saving.value = false
  }
}

async function save() {
  const target = editing.value
  const mode = target ? 'update' : 'create'
  formErrors.value = validateGrantForm(form.value, mode)
  if (formErrors.value.length > 0) return
  await run(async () => {
    if (target) await api.updateGrant(target.id, toUpdateBody(form.value))
    else await api.createGrant(toCreateBody(form.value, employeeCd.value))
    editing.value = undefined
    toast.add({ title: '保存しました', color: 'success' })
    await load()
  })
}

async function confirmDelete() {
  const g = deleting.value
  if (!g) return
  await run(async () => {
    await api.deleteGrant(g.id)
    deleting.value = null
    toast.add({ title: '削除しました', color: 'success' })
    await load()
  })
}

async function auto() {
  await run(async () => {
    const r = await api.autoGrants(employeeCd.value)
    toast.add({ title: autoResultMessage(r), color: r.hire_date === null ? 'warning' : 'success' })
    await load()
  })
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">有給付与台帳</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <UFormField label="乗務員" class="w-72">
        <EmployeeSelect v-model="employeeCd" />
      </UFormField>

      <UAlert v-if="error" color="error" :title="error" />
      <p v-if="employeeCd === ''" class="text-sm text-(--ui-text-muted)">乗務員を選ぶと、その人の付与台帳が出ます。</p>
      <p v-else-if="loading" class="text-sm text-(--ui-text-muted)">読み込み中…</p>

      <template v-if="data">
        <section class="space-y-1 rounded border border-(--ui-border) bg-(--ui-bg) p-3 text-sm">
          <div class="font-medium">{{ data.employee_name ?? data.employee_cd }}</div>
          <div>入社日: {{ data.hire_date ?? '未登録' }}</div>
          <div>
            {{ data.balance.as_of }} 時点の残: <span class="text-lg font-bold">{{ formatDays(data.balance.remaining) }}</span> 日
            <span class="text-(--ui-text-muted)">
              / 失効 {{ formatDays(data.balance.expired) }} 日 / 付与が足りず引けなかった分 {{ formatDays(data.balance.unallocated) }} 日
            </span>
          </div>
          <p class="text-xs text-(--ui-text-muted)">{{ BALANCE_NOTE }}</p>
        </section>

        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-plus" label="付与を追加" :disabled="saving" @click="openCreate" />
          <UButton
            icon="i-lucide-wand-sparkles"
            label="法定の付与を自動で足す"
            color="neutral"
            variant="outline"
            :loading="saving"
            @click="auto"
          />
        </div>

        <section v-if="showForm" class="space-y-3 rounded border border-(--ui-border) bg-(--ui-bg) p-3">
          <div class="font-medium">{{ editing ? '付与を編集' : '付与を追加' }}</div>
          <UAlert
            v-if="editing && editNotice(editing.source)"
            color="warning"
            icon="i-lucide-triangle-alert"
            :title="editNotice(editing.source) ?? ''"
          />
          <div class="flex flex-wrap items-end gap-3">
            <UFormField label="付与日">
              <input
                v-model="form.grant_date"
                type="date"
                :disabled="!!editing"
                class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm disabled:opacity-60"
              >
            </UFormField>
            <UFormField label="日数 (0〜999.9)">
              <input
                v-model="form.days"
                type="number"
                min="0"
                max="999.9"
                step="0.1"
                class="w-28 rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
              >
            </UFormField>
            <UFormField :label="editing ? '期限' : '期限 (省略すると付与日 + 2 年)'">
              <input
                v-model="form.expires_on"
                type="date"
                class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
              >
            </UFormField>
          </div>
          <UFormField label="備考">
            <UInput v-model="form.note" class="w-full" />
          </UFormField>
          <ul v-if="formErrors.length > 0" class="list-disc pl-5 text-sm text-(--ui-error)">
            <li v-for="m in formErrors" :key="m">{{ m }}</li>
          </ul>
          <div class="flex gap-2">
            <UButton label="保存" :loading="saving" @click="save" />
            <UButton label="キャンセル" color="neutral" variant="outline" :disabled="saving" @click="editing = undefined" />
          </div>
        </section>

        <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
          <table class="w-full text-sm">
            <thead class="bg-(--ui-bg-elevated) text-left">
              <tr>
                <th class="px-3 py-2">付与日</th>
                <th class="px-3 py-2 text-right">日数</th>
                <th class="px-3 py-2">期限</th>
                <th class="px-3 py-2">種別</th>
                <th class="px-3 py-2 text-right">消化</th>
                <th class="px-3 py-2 text-right">残</th>
                <th class="px-3 py-2 text-right">失効</th>
                <th class="px-3 py-2">備考</th>
                <th class="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-if="data.data.length === 0">
                <td colspan="9" class="px-3 py-6 text-center text-(--ui-text-muted)">付与がありません</td>
              </tr>
              <tr v-for="g in data.data" :key="g.id" class="border-t border-(--ui-border)">
                <td class="whitespace-nowrap px-3 py-2">{{ g.grant_date }}</td>
                <td class="px-3 py-2 text-right">{{ formatDays(g.days) }}</td>
                <td class="whitespace-nowrap px-3 py-2">{{ g.expires_on }}</td>
                <td class="px-3 py-2"><UBadge :label="sourceLabel(g.source)" variant="subtle" :color="g.source === 'auto' ? 'neutral' : 'primary'" /></td>
                <td class="px-3 py-2 text-right">{{ formatDays(g.used ?? 0) }}</td>
                <td class="px-3 py-2 text-right">{{ formatDays(g.remaining ?? 0) }}</td>
                <td class="px-3 py-2 text-right">{{ formatDays(g.expired ?? 0) }}</td>
                <td class="px-3 py-2">{{ g.note ?? '' }}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right">
                  <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" aria-label="編集" :disabled="saving" @click="openEdit(g)" />
                  <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="削除" :disabled="saving" @click="deleting = g" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <UModal :open="deleting !== null" title="付与を削除しますか" @update:open="(o: boolean) => { if (!o) deleting = null }">
      <template #body>
        <p v-if="deleting" class="text-sm">
          {{ deleting.grant_date }} 付与の {{ formatDays(deleting.days) }} 日 ({{ sourceLabel(deleting.source) }}) を削除します。
          自動の行を消しても、次に「法定の付与を自動で足す」を押すと同じ付与日で作り直されます。
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="やめる" color="neutral" variant="outline" @click="deleting = null" />
          <UButton label="削除する" color="error" :loading="saving" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
