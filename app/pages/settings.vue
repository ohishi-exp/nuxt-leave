<script setup lang="ts">
import { errorMessage, isForbidden, type BotConfig, type Department, type LineworksChannel } from '~/utils/leave-api'
import {
  DEFAULT_GRACE_DAYS,
  GRACE_DAYS_MAX,
  GRACE_DAYS_MIN,
  MAILBOX_DOMAIN,
  formToSettingsBody,
  mailboxAddress,
  mailboxError,
  settingsToForm,
  validateSettingsForm,
  type SettingsForm,
} from '~/utils/leave-settings'
import {
  botFormFromConfig,
  botWebhookUrl,
  channelLabel,
  emptyBotForm,
  toBotConfigBody,
  validateBotForm,
  type BotForm,
} from '~/utils/bot-config'

const api = useLeaveApi()
const toast = useToast()
const config = useRuntimeConfig()
const authWorkerUrl = String(config.public.authWorkerUrl ?? '')

const form = ref<SettingsForm>({
  mailbox: '',
  allowedSendersText: '',
  dept_codes: [],
  lineworks_channel_id: '',
  grace_days: DEFAULT_GRACE_DAYS,
  enabled: false,
})
const departments = ref<Department[]>([])
const channels = ref<LineworksChannel[]>([])
const bots = ref<BotConfig[]>([])

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const forbidden = ref(false)
const formErrors = ref<string[]>([])
const departmentsError = ref('')
const lineworksError = ref('')

const botForm = ref<BotForm | null>(null)
const botErrors = ref<string[]>([])
const botSaving = ref(false)

const address = computed(() => mailboxAddress(form.value.mailbox))
const mailboxMsg = computed(() => mailboxError(form.value.mailbox))

async function loadSettings() {
  loading.value = true
  error.value = ''
  try {
    form.value = settingsToForm(await api.getSettings())
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = errorMessage(e)
  }
  finally {
    loading.value = false
  }
}

async function loadDepartments() {
  try {
    departments.value = await api.listDepartments()
  }
  catch (e) {
    departmentsError.value = errorMessage(e)
  }
}

async function loadLineworks() {
  lineworksError.value = ''
  try {
    const [b, c] = await Promise.all([api.listBotConfigs(), api.listChannels()])
    bots.value = b.filter(x => x.provider === 'lineworks')
    channels.value = c
  }
  catch (e) {
    lineworksError.value = errorMessage(e)
  }
}

function toggleDept(code: string, on: boolean) {
  const set = new Set(form.value.dept_codes)
  if (on) set.add(code)
  else set.delete(code)
  form.value.dept_codes = [...set]
}

async function save() {
  formErrors.value = validateSettingsForm(form.value)
  if (formErrors.value.length > 0) return
  saving.value = true
  try {
    form.value = settingsToForm(await api.putSettings(formToSettingsBody(form.value)))
    toast.add({ title: '設定を保存しました', color: 'success' })
  }
  catch (e) {
    formErrors.value = [errorMessage(e)]
  }
  finally {
    saving.value = false
  }
}

function editBot(b?: BotConfig) {
  botErrors.value = []
  botForm.value = b ? botFormFromConfig(b) : emptyBotForm()
}

async function saveBot() {
  if (!botForm.value) return
  botErrors.value = validateBotForm(botForm.value)
  if (botErrors.value.length > 0) return
  botSaving.value = true
  try {
    await api.saveBotConfig(toBotConfigBody(botForm.value))
    botForm.value = null
    toast.add({ title: 'bot を保存しました', color: 'success' })
    await loadLineworks()
  }
  catch (e) {
    botErrors.value = [errorMessage(e)]
  }
  finally {
    botSaving.value = false
  }
}

async function removeBot(b: BotConfig) {
  if (!confirm(`bot「${b.name}」を削除しますか？`)) return
  try {
    await api.deleteBotConfig(b.id)
    await loadLineworks()
  }
  catch (e) {
    lineworksError.value = errorMessage(e)
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'コピーしました' })
  }
  catch {
    /* clipboard が使えない環境は何もしない */
  }
}

onMounted(() => {
  loadSettings()
  loadDepartments()
  loadLineworks()
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold">設定</h1>

    <UAlert v-if="forbidden" color="error" icon="i-lucide-shield-alert" :title="error" />
    <UAlert v-else-if="error" color="error" :title="error" />
    <div v-else-if="loading" class="text-(--ui-text-muted)">読み込み中…</div>

    <template v-else>
      <UCard>
        <template #header><h2 class="font-bold">受け付け</h2></template>
        <div class="space-y-5">
          <UFormField label="受信アドレス" :error="mailboxMsg ?? undefined">
            <div class="flex items-center gap-1">
              <UInput v-model="form.mailbox" placeholder="例: ohishi" class="w-64" />
              <span class="text-(--ui-text-muted)">@{{ MAILBOX_DOMAIN }}</span>
            </div>
            <p class="mt-1 text-sm">
              <template v-if="address">申請書の PDF はこの宛先に送ってください: <code>{{ address }}</code></template>
              <template v-else>英小文字・数字・ハイフンの 3〜64 文字。空なら受信しません。</template>
            </p>
          </UFormField>

          <UFormField
            label="受け付ける差出人"
            description="1 行に 1 アドレス。空なら全部の差出人を拒否します。"
          >
            <UTextarea v-model="form.allowedSendersText" :rows="4" class="w-full max-w-lg" placeholder="sender@example.com" />
          </UFormField>

          <UFormField label="乗務員の部門" description="この会社の乗務員の部門を選んでください。紐づけ画面の乗務員はこの部門の人だけになります。">
            <p v-if="departmentsError" class="text-sm text-(--ui-error)">{{ departmentsError }}</p>
            <div v-else class="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              <UCheckbox
                v-for="d in departments"
                :key="d.department_code"
                :model-value="form.dept_codes.includes(d.department_code)"
                :label="`${d.department_code} ${d.department_name}`"
                @update:model-value="(v: boolean | 'indeterminate') => toggleDept(d.department_code, v === true)"
              />
            </div>
          </UFormField>

          <UFormField label="警告の猶予日数" :description="`${GRACE_DAYS_MIN}〜${GRACE_DAYS_MAX} 日`">
            <UInput v-model.number="form.grace_days" type="number" :min="GRACE_DAYS_MIN" :max="GRACE_DAYS_MAX" class="w-32" />
          </UFormField>

          <USwitch v-model="form.enabled" label="有効にする" />
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="font-bold">LINE WORKS</h2></template>
        <div class="space-y-5">
          <UAlert v-if="lineworksError" color="error" :title="lineworksError" />

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-medium">bot</h3>
              <UButton icon="i-lucide-plus" label="bot を登録" size="sm" color="neutral" variant="outline" @click="editBot()" />
            </div>
            <p v-if="bots.length === 0" class="text-sm text-(--ui-text-muted)">登録された bot はありません</p>
            <div v-for="b in bots" :key="b.id" class="space-y-1 rounded border border-(--ui-border) p-3 text-sm">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ b.name }}</span>
                <UBadge :label="b.enabled ? '有効' : '無効'" :color="b.enabled ? 'success' : 'neutral'" variant="subtle" />
                <span class="ml-auto flex gap-1">
                  <UButton label="編集" size="xs" color="neutral" variant="ghost" @click="editBot(b)" />
                  <UButton label="削除" size="xs" color="error" variant="ghost" @click="removeBot(b)" />
                </span>
              </div>
              <div class="text-(--ui-text-muted)">Bot ID: {{ b.bot_id }} / Client ID: {{ b.client_id }} / Service Account: {{ b.service_account }}</div>
              <div v-if="authWorkerUrl" class="flex items-center gap-1">
                <span class="text-(--ui-text-muted)">Callback URL:</span>
                <code class="break-all">{{ botWebhookUrl(authWorkerUrl, b.bot_id) }}</code>
                <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="コピー" @click="copy(botWebhookUrl(authWorkerUrl, b.bot_id))" />
              </div>
            </div>

            <div v-if="botForm" class="space-y-3 rounded border border-(--ui-border) p-3">
              <h4 class="font-medium">{{ botForm.id ? 'bot を編集' : 'bot を登録' }}</h4>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="名前" required><UInput v-model="botForm.name" class="w-full" /></UFormField>
                <UFormField label="Bot ID" required><UInput v-model="botForm.bot_id" class="w-full" /></UFormField>
                <UFormField label="Client ID" required><UInput v-model="botForm.client_id" class="w-full" /></UFormField>
                <UFormField label="Service Account" required><UInput v-model="botForm.service_account" class="w-full" /></UFormField>
                <UFormField label="Client Secret" :required="!botForm.id" :description="botForm.id ? '空なら変えません' : undefined">
                  <UInput v-model="botForm.client_secret" type="password" autocomplete="off" class="w-full" />
                </UFormField>
                <UFormField label="Bot Secret" :description="botForm.id ? '空なら変えません' : undefined">
                  <UInput v-model="botForm.bot_secret" type="password" autocomplete="off" class="w-full" />
                </UFormField>
              </div>
              <USwitch v-model="botForm.enabled" label="有効" />
              <UAlert v-if="botErrors.length > 0" color="error" title="保存できません">
                <template #description>
                  <ul class="list-disc pl-5"><li v-for="m in botErrors" :key="m">{{ m }}</li></ul>
                </template>
              </UAlert>
              <div class="flex gap-2">
                <UButton label="bot を保存" :loading="botSaving" @click="saveBot" />
                <UButton label="やめる" color="neutral" variant="ghost" @click="botForm = null" />
              </div>
            </div>
          </div>

          <UFormField label="通知先グループ" description="bot をグループに招待すると一覧に出ます。">
            <select v-model="form.lineworks_channel_id" class="w-full max-w-md rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1">
              <option value="">通知しない</option>
              <option v-for="c in channels" :key="c.id" :value="c.id">{{ channelLabel(c) }}</option>
            </select>
          </UFormField>
        </div>
      </UCard>

      <UAlert v-if="formErrors.length > 0" color="error" title="保存できません">
        <template #description>
          <ul class="list-disc pl-5"><li v-for="m in formErrors" :key="m">{{ m }}</li></ul>
        </template>
      </UAlert>

      <UButton label="設定を保存" icon="i-lucide-save" :loading="saving" @click="save" />
    </template>
  </div>
</template>
