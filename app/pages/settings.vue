<script setup lang="ts">
import { ADMIN_ONLY_MESSAGE, adminErrorMessage, errorStatus, isForbidden, type BotConfig, type Department, type LineworksChannel, type NotifyRecipient } from '~/utils/leave-api'
import {
  DEFAULT_GRACE_DAYS,
  GRACE_DAYS_MAX,
  GRACE_DAYS_MIN,
  channelTarget,
  formToSettingsBody,
  notifyBotOptions,
  recipientTarget,
  settingsToForm,
  testNotifyBlocker,
  validateSettingsForm,
  type SettingsForm,
} from '~/utils/leave-settings'
import {
  botFormFromConfig,
  botWebhookUrl,
  channelLabel,
  emptyBotForm,
  lineworksRecipients,
  recipientLabel,
  toBotConfigBody,
  validateBotForm,
  type BotForm,
} from '~/utils/bot-config'
import {
  LABEL_MAX,
  deviceSetup,
  deviceSetupRows,
  formatIssuedDate,
  labelError,
  sortCredentials,
  type DeviceSetup,
  type MachineCredential,
} from '~/utils/machine-credentials'

const api = useLeaveApi()
const credApi = useMachineCredentialApi()
const toast = useToast()
const config = useRuntimeConfig()
const authWorkerUrl = String(config.public.authWorkerUrl ?? '')

const form = ref<SettingsForm>({
  dept_codes: [],
  notify_target: '',
  notify_bot_config_id: '',
  grace_days: DEFAULT_GRACE_DAYS,
  enabled: false,
})
/** 最後に読んだ / 保存した設定 (テスト送信の判定に使う) */
const saved = ref<SettingsForm | null>(null)
const departments = ref<Department[]>([])
const channels = ref<LineworksChannel[]>([])
const recipients = ref<NotifyRecipient[]>([])
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

const testing = ref(false)
const testResult = ref<{ ok: boolean, message: string } | null>(null)

const creds = ref<MachineCredential[]>([])
const credsError = ref('')
const credsForbidden = ref(false)
const credLabel = ref('')
const credLabelError = ref<string | null>(null)
const credIssuing = ref(false)
/** 発行直後の設定例 (password はここにしか無い。閉じたら二度と出せない) */
const issued = ref<DeviceSetup | null>(null)

const issuedRows = computed(() => issued.value ? deviceSetupRows(issued.value) : [])
const isRecipientTarget = computed(() => form.value.notify_target.startsWith('recipient:'))
const botOptions = computed(() => notifyBotOptions(bots.value))
const testBlocker = computed(() => testNotifyBlocker(saved.value, form.value))

async function loadSettings() {
  loading.value = true
  error.value = ''
  try {
    const s = await api.getSettings()
    form.value = settingsToForm(s)
    saved.value = settingsToForm(s)
  }
  catch (e) {
    forbidden.value = isForbidden(e)
    error.value = adminErrorMessage(e)
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
    departmentsError.value = adminErrorMessage(e)
  }
}

async function loadLineworks() {
  lineworksError.value = ''
  try {
    const [b, c, r] = await Promise.all([api.listBotConfigs(), api.listChannels(), api.listRecipients()])
    bots.value = b.filter(x => x.provider === 'lineworks')
    channels.value = c
    recipients.value = lineworksRecipients(r)
  }
  catch (e) {
    lineworksError.value = adminErrorMessage(e)
  }
}

async function loadCreds() {
  credsError.value = ''
  try {
    creds.value = sortCredentials(await credApi.list())
  }
  catch (e) {
    credsForbidden.value = isForbidden(e)
    credsError.value = adminErrorMessage(e)
  }
}

async function issueCred() {
  credLabelError.value = labelError(credLabel.value)
  if (credLabelError.value) return
  credIssuing.value = true
  try {
    const c = await credApi.issue(credLabel.value)
    issued.value = deviceSetup(authWorkerUrl, c)
    credLabel.value = ''
    await loadCreds()
  }
  catch (e) {
    credsForbidden.value = isForbidden(e)
    credLabelError.value = adminErrorMessage(e)
  }
  finally {
    credIssuing.value = false
  }
}

function closeIssued() {
  if (!confirm('閉じるとパスワードは二度と表示できません。控えましたか？')) return
  issued.value = null
}

async function revokeCred(c: MachineCredential) {
  if (!confirm(`「${c.label}」(${c.username}) を失効させますか？ この資格情報で送れなくなります。`)) return
  try {
    await credApi.revoke(c.username)
    await loadCreds()
  }
  catch (e) {
    credsError.value = adminErrorMessage(e)
  }
}

const rotatingUsername = ref('')

async function rotateCred(c: MachineCredential) {
  if (!confirm(`「${c.label}」(${c.username}) のパスワードを作り直します。今のパスワードはすぐ使えなくなります。複合機のパスワード欄を新しいものに入れ替えてください。`)) return
  rotatingUsername.value = c.username
  try {
    const r = await credApi.rotate(c.username)
    issued.value = deviceSetup(authWorkerUrl, r)
    await loadCreds()
  }
  catch (e) {
    credsError.value = errorStatus(e) === 404 ? 'この資格情報は失効しているか見つかりません' : adminErrorMessage(e)
  }
  finally {
    rotatingUsername.value = ''
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
    const s = await api.putSettings(formToSettingsBody(form.value))
    form.value = settingsToForm(s)
    saved.value = settingsToForm(s)
    testResult.value = null
    toast.add({ title: '設定を保存しました', color: 'success' })
  }
  catch (e) {
    formErrors.value = [adminErrorMessage(e)]
  }
  finally {
    saving.value = false
  }
}

async function sendTest() {
  if (testing.value || testBlocker.value) return
  testing.value = true
  testResult.value = null
  try {
    await api.testNotify()
    testResult.value = { ok: true, message: '送りました。LINE WORKS を確認してください' }
  }
  catch (e) {
    testResult.value = { ok: false, message: adminErrorMessage(e) }
  }
  finally {
    testing.value = false
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
    botErrors.value = [adminErrorMessage(e)]
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
    lineworksError.value = adminErrorMessage(e)
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
  loadCreds()
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

          <UFormField label="通知先" description="グループは bot を招待すると、個人は通知の受信者に LINE WORKS の人がいると一覧に出ます。">
            <select v-model="form.notify_target" class="w-full max-w-md rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1">
              <option value="">通知しない</option>
              <optgroup label="グループ">
                <option v-for="c in channels" :key="c.id" :value="channelTarget(c.id)">{{ channelLabel(c) }}</option>
              </optgroup>
              <optgroup label="個人">
                <option v-for="r in recipients" :key="r.id" :value="recipientTarget(r.id)">{{ recipientLabel(r) }}</option>
              </optgroup>
            </select>
            <div v-if="isRecipientTarget" class="mt-3">
              <UFormField label="送る bot" required description="個人宛てはこの bot から届きます。">
                <select v-model="form.notify_bot_config_id" class="w-full max-w-md rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1">
                  <option value="">選んでください</option>
                  <option v-for="b in botOptions" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </UFormField>
            </div>
            <div class="mt-2 flex items-center gap-3">
              <UButton
                label="テスト送信"
                icon="i-lucide-send"
                color="neutral"
                variant="outline"
                :loading="testing"
                :disabled="testBlocker !== null"
                @click="sendTest"
              />
              <span v-if="testBlocker === 'unsaved'" class="text-sm text-(--ui-text-muted)">保存してから送れます</span>
            </div>
            <UAlert
              v-if="testResult"
              class="mt-2 max-w-md"
              :color="testResult.ok ? 'success' : 'error'"
              :title="testResult.message"
            />
          </UFormField>
        </div>
      </UCard>

      <UAlert v-if="formErrors.length > 0" color="error" title="保存できません">
        <template #description>
          <ul class="list-disc pl-5"><li v-for="m in formErrors" :key="m">{{ m }}</li></ul>
        </template>
      </UAlert>

      <UButton label="設定を保存" icon="i-lucide-save" :loading="saving" @click="save" />

      <UCard>
        <template #header><h2 class="font-bold">スキャン送信用の資格情報</h2></template>
        <div v-if="credsForbidden" class="text-sm text-(--ui-text-muted)">{{ ADMIN_ONLY_MESSAGE }}</div>
        <div v-else class="space-y-4">
          <p class="text-sm text-(--ui-text-muted)">
            複合機や PC が申請書の PDF を WebDAV で送るときのユーザー名とパスワードです。
          </p>
          <UAlert v-if="credsError" color="error" :title="credsError" />

          <div v-if="issued" class="space-y-3 rounded border border-(--ui-warning) p-3 text-sm">
            <UAlert
              color="warning"
              icon="i-lucide-triangle-alert"
              title="パスワードはこの画面で 1 回だけ表示します。閉じたら二度と表示できません。"
            />
            <h3 class="font-medium">複合機の設定</h3>
            <dl class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1">
              <template v-for="[k, v] in issuedRows" :key="k">
                <dt class="text-(--ui-text-muted)">{{ k }}</dt>
                <dd><code class="break-all">{{ v }}</code></dd>
                <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="コピー" @click="copy(v)" />
              </template>
            </dl>
            <h3 class="font-medium">PC から試す</h3>
            <div class="flex items-center gap-1">
              <code class="break-all">{{ issued.curl }}</code>
              <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="コピー" @click="copy(issued.curl)" />
            </div>
            <UButton label="閉じる" color="neutral" variant="outline" size="sm" @click="closeIssued" />
          </div>

          <UFormField label="名前" :error="credLabelError ?? undefined" :description="`どの機械用か分かる名前 (${LABEL_MAX} 文字まで)`">
            <div class="flex gap-2">
              <UInput v-model="credLabel" placeholder="例: 本社の複合機" class="w-64" />
              <UButton label="発行" icon="i-lucide-key-round" :loading="credIssuing" @click="issueCred" />
            </div>
          </UFormField>

          <p v-if="creds.length === 0" class="text-sm text-(--ui-text-muted)">発行した資格情報はありません</p>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left text-(--ui-text-muted)">
                <th class="py-1">名前</th>
                <th>ユーザー名</th>
                <th>発行日</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in creds" :key="c.username" class="border-t border-(--ui-border)" :class="{ 'text-(--ui-text-muted)': c.revoked }">
                <td class="py-1">{{ c.label }}</td>
                <td><code>{{ c.username }}</code></td>
                <td>{{ formatIssuedDate(c.created_at) }}</td>
                <td class="text-right">
                  <UBadge v-if="c.revoked" label="失効済み" color="neutral" variant="subtle" />
                  <template v-else>
                    <UButton label="パスワードを再発行" size="xs" variant="ghost" :loading="rotatingUsername === c.username" :disabled="rotatingUsername !== ''" @click="rotateCred(c)" />
                    <UButton label="失効" size="xs" color="error" variant="ghost" @click="revokeCred(c)" />
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
