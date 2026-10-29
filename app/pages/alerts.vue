<script setup lang="ts">
import { errorMessage, isForbidden, type Employee, type LeaveAlert } from '~/utils/leave-api'
import { groupAlerts, notifyAlertsMessage } from '~/utils/leave-alerts'

const api = useLeaveApi()
const toast = useToast()

const alerts = ref<LeaveAlert[]>([])
const range = ref('直近〜昨日')
const employees = ref<Employee[]>([])
const loading = ref(true)
const error = ref('')
const forbidden = ref(false)

const groups = computed(() => groupAlerts(alerts.value, employees.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await api.listAlerts()
    alerts.value = r.alerts
    range.value = r.from && r.to ? `${r.from}〜${r.to}` : '直近〜昨日'
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

/** 今の漏れを通知先へ送る (毎朝と同じ文面。管理者だけ)。送ったら一覧を読み直す */
const sending = ref(false)
async function sendNow() {
  sending.value = true
  try {
    const r = await api.notifyAlerts()
    toast.add({ title: notifyAlertsMessage(r), color: 'success' })
    await load()
  }
  catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
  finally {
    sending.value = false
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
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-sm">未解消の漏れ: {{ alerts.length }} 件 ({{ range }})</p>
        <UButton
          icon="i-lucide-send"
          label="今の漏れを通知先へ送る"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="sending"
          :disabled="alerts.length === 0"
          @click="sendNow"
        />
      </div>
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
