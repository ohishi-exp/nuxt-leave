<script setup lang="ts">
import { errorMessage, isForbidden, type CalendarResponse } from '~/utils/leave-api'
import {
  buildMonthDays,
  buildWeeks,
  currentMonth,
  dayCellClass,
  dayStatusColor,
  dayStatusLabel,
  DAY_STATUS_LABELS,
  entryLabel,
  isMonth,
  monthTitle,
  shiftMonth,
  WEEKDAYS,
  weekdayClass,
} from '~/utils/calendar'
import { formatDays } from '~/utils/grants'

const api = useLeaveApi()
const route = useRoute()
const router = useRouter()

const employeeCd = ref(typeof route.query.employee_cd === 'string' ? route.query.employee_cd : '')
const month = ref(isMonth(route.query.month) ? route.query.month : currentMonth(new Date()))
const data = ref<CalendarResponse | null>(null)
const loading = ref(false)
const error = ref('')
const forbidden = ref(false)

const weeks = computed(() => buildWeeks(buildMonthDays(month.value, data.value?.days ?? [])))
const legend = Object.entries(DAY_STATUS_LABELS).map(([status, label]) => ({ status, label }))

async function load() {
  data.value = null
  error.value = ''
  if (employeeCd.value === '' || !isMonth(month.value)) return
  loading.value = true
  try {
    data.value = await api.getCalendar(employeeCd.value, month.value)
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
  }
  finally {
    loading.value = false
  }
}

watch([employeeCd, month], () => {
  router.replace({
    query: { employee_cd: employeeCd.value || undefined, month: month.value || undefined },
  })
  load()
})

function onMonthInput(v: string) {
  if (isMonth(v)) month.value = v
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">乗務員のカレンダー</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />

    <template v-else>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="乗務員" class="w-72">
          <EmployeeSelect v-model="employeeCd" />
        </UFormField>
        <div class="flex items-end gap-1">
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" aria-label="前の月" @click="month = shiftMonth(month, -1)" />
          <UFormField label="月">
            <input
              type="month"
              :value="month"
              class="rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1.5 text-sm"
              @input="onMonthInput(($event.target as HTMLInputElement).value)"
            >
          </UFormField>
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" aria-label="次の月" @click="month = shiftMonth(month, 1)" />
        </div>
      </div>

      <UAlert v-if="error" color="error" :title="error" />
      <p v-if="employeeCd === ''" class="text-sm text-(--ui-text-muted)">乗務員を選ぶと、その月の休暇が出ます。</p>
      <p v-else-if="loading" class="text-sm text-(--ui-text-muted)">読み込み中…</p>

      <template v-if="data">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="font-medium">{{ data.employee_name ?? data.employee_cd }} / {{ monthTitle(data.month) }}</span>
          <span v-for="l in legend" :key="l.status" class="flex items-center gap-1">
            <UBadge :color="dayStatusColor(l.status)" variant="subtle" :label="l.label" />
          </span>
          <span class="text-(--ui-text-muted)">勤務日は表示しません</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full table-fixed border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th v-for="(w, i) in WEEKDAYS" :key="w" class="py-1 text-center" :class="weekdayClass(i)">{{ w }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, wi) in weeks" :key="wi">
                <td v-for="(cell, ci) in week" :key="ci" class="h-24 align-top">
                  <div
                    v-if="cell"
                    class="h-full space-y-1 rounded border p-1"
                    :class="dayCellClass(cell.entry)"
                  >
                    <div class="text-xs" :class="weekdayClass(cell.weekday)">{{ cell.day }}</div>
                    <template v-if="cell.entry">
                      <div v-for="(e, i) in cell.entry.ichiban" :key="`i${i}`" class="text-xs">
                        <span class="text-(--ui-text-muted)">一番星</span> {{ entryLabel(e) }}
                      </div>
                      <div v-for="(e, i) in cell.entry.pdf" :key="`p${i}`" class="text-xs">
                        <NuxtLink :to="`/pages/${e.page_id}`" class="text-(--ui-primary) underline">申請書</NuxtLink>
                        {{ entryLabel(e) }}
                      </div>
                      <UBadge :color="dayStatusColor(cell.entry.status)" variant="subtle" size="sm" :label="dayStatusLabel(cell.entry.status)" />
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section class="space-y-1 rounded border border-(--ui-border) bg-(--ui-bg) p-3 text-sm">
          <div>
            月末 ({{ data.yukyu.as_of }}) の有給: 残 {{ formatDays(data.yukyu.remaining) }} 日
            <span class="text-(--ui-text-muted)">
              / 失効 {{ formatDays(data.yukyu.expired) }} 日 / 付与が足りず引けなかった分 {{ formatDays(data.yukyu.unallocated) }} 日
            </span>
          </div>
          <div class="text-(--ui-text-muted)">
            労災: 今月 {{ formatDays(data.rousai.month) }} 日 / 今年 {{ formatDays(data.rousai.year) }} 日
          </div>
          <p class="text-xs text-(--ui-text-muted)">
            有給の残は近似です ({{ data.yukyu.consumption_from }} 以降の消化を数えています)。
          </p>
          <UAlert
            v-if="data.unknown_items > 0"
            color="warning"
            icon="i-lucide-triangle-alert"
            :title="`一番星に、区分が分からない休暇の項目が ${data.unknown_items} 件あります (カレンダーには出していません)`"
          />
        </section>
      </template>
    </template>
  </div>
</template>
