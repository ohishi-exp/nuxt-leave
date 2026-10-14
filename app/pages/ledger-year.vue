<script setup lang="ts">
import { errorMessage, isForbidden, type LedgerResponse } from '~/utils/leave-api'
import { formatDays } from '~/utils/grants'
import { todayIso } from '~/utils/opening'
import { asOfFromQuery, fiscalYearLabel, shiftAsOf } from '~/utils/ledger-year'

const api = useLeaveApi()
const route = useRoute()
const router = useRouter()

const asOf = ref(asOfFromQuery(route.query.as_of, todayIso()))
const ledger = ref<LedgerResponse | null>(null)
const loading = ref(false)
const error = ref('')
const forbidden = ref(false)

const rows = computed(() => ledger.value?.data ?? [])

async function load() {
  loading.value = true
  error.value = ''
  try {
    ledger.value = await api.getLedger(asOf.value)
  }
  catch (e) {
    ledger.value = null
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
  }
  finally {
    loading.value = false
  }
}

function setAsOf(v: string) {
  // 日付入力を消したときは今の基準日のまま
  if (v !== '') asOf.value = v
}

watch(asOf, () => {
  router.replace({ query: { as_of: asOf.value } })
  load()
})

function shift(unit: 'month' | 'year', delta: number) {
  asOf.value = shiftAsOf(asOf.value, unit, delta)
}

function openGrants(code: string) {
  navigateTo({ path: '/grants', query: { employee_cd: code } })
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">有給の年度一覧</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <section class="flex flex-wrap items-end gap-3 rounded border border-(--ui-border) bg-(--ui-bg) p-3">
        <UFormField label="基準日">
          <input
            :value="asOf"
            type="date"
            class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
            @input="setAsOf(($event.target as HTMLInputElement).value)"
          >
        </UFormField>
        <div class="flex flex-wrap gap-1">
          <UButton label="去年" color="neutral" variant="outline" @click="shift('year', -1)" />
          <UButton label="先月" color="neutral" variant="outline" @click="shift('month', -1)" />
          <UButton label="今日" color="neutral" variant="outline" @click="asOf = todayIso()" />
          <UButton label="翌月" color="neutral" variant="outline" @click="shift('month', 1)" />
          <UButton label="翌年" color="neutral" variant="outline" @click="shift('year', 1)" />
        </div>
        <span v-if="ledger" class="pb-2 text-sm font-medium">{{ fiscalYearLabel(ledger.fiscal_year) }}</span>
      </section>

      <UAlert v-if="error" color="error" :title="error" />

      <p v-if="loading" class="text-sm text-(--ui-text-muted)">読み込み中…</p>

      <div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
        <table class="w-full text-sm">
          <thead class="bg-(--ui-bg-elevated) text-left">
            <tr>
              <th class="px-3 py-2">乗務員</th>
              <th class="px-3 py-2">入社日</th>
              <th class="px-3 py-2">直近の付与日</th>
              <th class="px-3 py-2 text-right">付与日数</th>
              <th class="px-3 py-2 text-right">年度内の付与</th>
              <th class="px-3 py-2 text-right">年度内の取得</th>
              <th class="px-3 py-2 text-right">残</th>
              <th class="px-3 py-2 text-right">失効</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!loading && !error && rows.length === 0">
              <td colspan="8" class="px-3 py-6 text-center text-(--ui-text-muted)">
                乗務員がいません。設定で部門を選んでください
              </td>
            </tr>
            <tr
              v-for="r in rows"
              :key="r.employee_cd"
              class="cursor-pointer border-t border-(--ui-border) hover:bg-(--ui-bg-elevated)"
              @click="openGrants(r.employee_cd)"
            >
              <td class="whitespace-nowrap px-3 py-2">{{ r.employee_cd }} {{ r.employee_name ?? '' }}</td>
              <td class="whitespace-nowrap px-3 py-2">{{ r.hire_date ?? '未登録' }}</td>
              <td class="whitespace-nowrap px-3 py-2">{{ r.latest_grant?.grant_date ?? '—' }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ r.latest_grant ? formatDays(r.latest_grant.days) : '—' }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ formatDays(r.granted_in_fy) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ formatDays(r.used_in_fy) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ formatDays(r.remaining) }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ formatDays(r.expired) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
