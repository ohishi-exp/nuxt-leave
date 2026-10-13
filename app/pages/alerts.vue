<script setup lang="ts">
import { errorMessage, isForbidden, type Employee, type LeaveAlert } from '~/utils/leave-api'
import { groupAlerts } from '~/utils/leave-alerts'

const api = useLeaveApi()

const alerts = ref<LeaveAlert[]>([])
const employees = ref<Employee[]>([])
const loading = ref(true)
const error = ref('')
const forbidden = ref(false)

const groups = computed(() => groupAlerts(alerts.value, employees.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    alerts.value = await api.listAlerts()
    try {
      employees.value = await api.listEmployees()
    }
    catch {
      employees.value = []
    }
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">漏れ</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />
    <UAlert v-else-if="error" color="error" :title="error" />
    <p v-else-if="loading" class="text-sm text-(--ui-text-muted)">読み込み中…</p>

    <template v-else>
      <p class="text-sm">未解消の漏れ: {{ alerts.length }} 件 (直近 62 日〜昨日)</p>
      <p v-if="alerts.length === 0" class="text-sm text-(--ui-text-muted)">未解消の漏れはありません</p>

      <section
        v-for="g in groups"
        :key="g.employee_cd"
        class="space-y-2 rounded-lg border border-(--ui-border) bg-(--ui-bg) p-3"
      >
        <h2 class="font-medium">{{ g.label }}</h2>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="(r, i) in g.rows" :key="i" class="border-t border-(--ui-border)">
              <td class="whitespace-nowrap px-3 py-1.5">{{ r.dayLabel }}</td>
              <td class="px-3 py-1.5">{{ r.kindLabel }}</td>
              <td class="px-3 py-1.5">{{ r.directionLabel }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
