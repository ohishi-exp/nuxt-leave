/**
 * 休暇申請の画面が叩く API の型と呼び出し (URL と body の組み立て) をここに集約する。
 *
 * - `/api/leave/*` は rust-leave-worker (auth-worker `/alc-proxy` 経由)
 * - `/api/admin/bot/configs`・`/api/notify/lineworks/channels` は rust-alc-api の既存の口
 *
 * 画面からは `/api/proxy/api/...` を叩く (server/api/proxy が auth-worker に渡す)。
 * fetch の実体は引数で受ける (画面は $fetch、テストは偽物)。
 */

export const API_BASE = '/api/proxy/api'

export type PageStatus = 'unlinked' | 'linked' | 'ignored'
export type PeriodKind = 'yukyu' | 'rousai' | 'tokukyu' | 'kekkin'
export type Half = 'am' | 'pm'

export interface LeavePage {
  id: string
  r2_key: string
  page_no: number
  mail_from: string | null
  subject: string | null
  received_at: string
  employee_cd: string | null
  status: PageStatus
  linked_by: string | null
  linked_at: string | null
  note: string | null
  created_at: string
}

export interface LeavePeriod {
  kind: PeriodKind
  start_date: string
  end_date: string
  half: Half | null
}

export interface LeavePageDetail extends LeavePage {
  periods: LeavePeriod[]
}

export interface PageUpdateBody {
  employee_cd: string | null
  status: PageStatus
  note: string | null
  periods: LeavePeriod[]
}

/** 一番星の社員 (back が tenant の部門で絞った行) */
export interface Employee {
  employee_code: string
  employee_name: string | null
  dept_code?: string | number | null
  hire_date?: string | null
  retire_date?: string | null
}

export interface Department {
  department_code: string
  department_name: string
}

export interface LeaveSettings {
  mailbox: string | null
  allowed_senders: string[]
  dept_codes: string[]
  lineworks_channel_id: string | null
  grace_days: number
  enabled: boolean
  updated_at?: string | null
}

export type SettingsBody = Omit<LeaveSettings, 'updated_at'>

export interface BotConfig {
  id: string
  provider: string
  name: string
  client_id: string
  service_account: string
  bot_id: string
  enabled: boolean
}

export interface BotConfigBody {
  id?: string
  provider?: string
  name: string
  client_id: string
  client_secret?: string
  service_account: string
  private_key?: string
  bot_id: string
  enabled?: boolean
  bot_secret?: string
}

export interface LineworksChannel {
  id: string
  channel_id: string
  title: string | null
  bot_config_id?: string
  active?: boolean
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number>
  responseType?: 'json' | 'arrayBuffer'
}

export type Fetcher = <T>(url: string, options?: FetchOptions) => Promise<T>

export const PAGE_LIMIT = 50

export interface ListPagesParams {
  status: PageStatus
  limit?: number
  offset?: number
}

export function listPagesQuery(p: ListPagesParams): Record<string, string | number> {
  return { status: p.status, limit: p.limit ?? PAGE_LIMIT, offset: p.offset ?? 0 }
}

export function pageUrl(id: string): string {
  return `${API_BASE}/leave/pages/${encodeURIComponent(id)}`
}

export function pagePdfUrl(id: string): string {
  return `${pageUrl(id)}/pdf`
}

export function botConfigUrl(id: string): string {
  return `${API_BASE}/admin/bot/configs/${encodeURIComponent(id)}`
}

export function createLeaveApi(fetcher: Fetcher) {
  return {
    async listPages(p: ListPagesParams): Promise<LeavePage[]> {
      const r = await fetcher<{ data: LeavePage[] }>(`${API_BASE}/leave/pages`, {
        query: listPagesQuery(p),
      })
      return r.data
    },
    getPage(id: string): Promise<LeavePageDetail> {
      return fetcher<LeavePageDetail>(pageUrl(id))
    },
    updatePage(id: string, body: PageUpdateBody): Promise<LeavePageDetail> {
      return fetcher<LeavePageDetail>(pageUrl(id), { method: 'PUT', body })
    },
    getPagePdf(id: string): Promise<ArrayBuffer> {
      return fetcher<ArrayBuffer>(pagePdfUrl(id), { responseType: 'arrayBuffer' })
    },
    async listEmployees(): Promise<Employee[]> {
      const r = await fetcher<{ data: Employee[] }>(`${API_BASE}/leave/employees`)
      return r.data
    },
    async listDepartments(): Promise<Department[]> {
      const r = await fetcher<{ data: Department[] }>(`${API_BASE}/leave/departments`)
      return r.data
    },
    getSettings(): Promise<LeaveSettings> {
      return fetcher<LeaveSettings>(`${API_BASE}/leave/settings`)
    },
    putSettings(body: SettingsBody): Promise<LeaveSettings> {
      return fetcher<LeaveSettings>(`${API_BASE}/leave/settings`, { method: 'PUT', body })
    },
    async listBotConfigs(): Promise<BotConfig[]> {
      const r = await fetcher<{ configs: BotConfig[] }>(`${API_BASE}/admin/bot/configs`)
      return r.configs
    },
    saveBotConfig(body: BotConfigBody): Promise<unknown> {
      return fetcher(`${API_BASE}/admin/bot/configs`, { method: 'POST', body })
    },
    deleteBotConfig(id: string): Promise<unknown> {
      return fetcher(botConfigUrl(id), { method: 'DELETE' })
    },
    listChannels(): Promise<LineworksChannel[]> {
      return fetcher<LineworksChannel[]>(`${API_BASE}/notify/lineworks/channels`)
    },
  }
}

export type LeaveApi = ReturnType<typeof createLeaveApi>

/** back が返すエラーの語 (`{"error":"..."}`) を画面の文にする */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_body: '送った内容の形が正しくありません',
  invalid_query: '一覧の条件が正しくありません',
  invalid_status: '状態の値が正しくありません',
  invalid_kind: '区分の値が正しくありません',
  invalid_half: '半日の値が正しくありません',
  period_end_before_start: '終了日が開始日より前の期間があります',
  half_day_must_be_single_day: '半日は開始日と終了日が同じ日のときだけ選べます',
  linked_requires_employee_cd: '紐づけるには乗務員を選んでください',
  linked_requires_periods: '紐づけるには期間を 1 行以上入れてください',
  invalid_employee_cd: '乗務員の社員C が正しくありません',
  note_too_long: '備考が長すぎます (2000 字まで)',
  too_many_periods: '期間は 50 行までです',
  invalid_mailbox: '受信アドレスは英小文字・数字・ハイフンの 3〜64 文字です',
  mailbox_taken: 'この受信アドレスは他の会社が使っています',
  invalid_grace_days: '警告の猶予日数は 0〜60 です',
  unknown_lineworks_channel: '通知先グループが見つかりません',
  ichiban_not_configured: '一番星につながっていません (この環境では社員・部門を読めません)',
  ichiban_upstream: '一番星から社員・部門を読めませんでした',
  ichiban_unavailable: '一番星から社員・部門を読めませんでした',
  ichiban_bad_response: '一番星の応答が読めませんでした',
  not_found: '見つかりません',
  pdf_not_found: 'PDF が見つかりません',
  internal_error: 'サーバーでエラーが起きました',
}

export const FORBIDDEN_MESSAGE = 'この画面は管理者だけが使えます'

interface FetchErrorLike {
  status?: number
  statusCode?: number
  data?: { error?: unknown, message?: unknown } | null
  message?: unknown
}

export function errorStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') return undefined
  const f = e as FetchErrorLike
  return f.status ?? f.statusCode
}

export function isForbidden(e: unknown): boolean {
  return errorStatus(e) === 403
}

/** fetch のエラーを画面に出す 1 文にする (403 は管理者でない旨、既知の語は日本語) */
export function errorMessage(e: unknown): string {
  if (isForbidden(e)) return FORBIDDEN_MESSAGE
  if (!e || typeof e !== 'object') return String(e)
  const f = e as FetchErrorLike
  const code = f.data?.error
  if (typeof code === 'string') return ERROR_MESSAGES[code] ?? code
  if (typeof f.data?.message === 'string') return f.data.message
  if (typeof f.message === 'string' && f.message) return f.message
  return 'エラーが起きました'
}
