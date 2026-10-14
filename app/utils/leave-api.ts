/**
 * 休暇申請の画面が叩く API の型と呼び出し (URL と body の組み立て) をここに集約する。
 *
 * - `/api/leave/*` は rust-leave-worker (auth-worker `/alc-proxy` 経由)
 * - `/api/admin/bot/configs`・`/api/notify/lineworks/channels`・`/api/notify/recipients` は rust-alc-api の既存の口
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

export type AlertDirection = 'ichiban_only' | 'pdf_only'

/** 未解消の漏れ 1 件 (`GET /api/leave/alerts`) */
export interface LeaveAlert {
  employee_cd: string
  day: string
  kind: string
  direction: AlertDirection
  first_seen_at: string
  notified_at: string | null
}

export interface Department {
  department_code: string
  department_name: string
}

export interface LeaveSettings {
  dept_codes: string[]
  lineworks_channel_id: string | null
  notify_recipient_id: string | null
  /** 個人宛てに使う LINE WORKS bot (個人を選んだときだけ値) */
  notify_bot_config_id: string | null
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

/** 通知の受信者 (rust-alc-api `GET /notify/recipients` の行のうち画面で使う列) */
export interface NotifyRecipient {
  id: string
  name: string
  provider: string
  enabled: boolean
}

/** カレンダーの 1 日の状態 (back の reconcile::day_status) */
export type DayStatus = 'match' | 'ichiban_only' | 'pdf_only' | 'mismatch'

export interface CalendarIchibanEntry {
  kind: PeriodKind
  half: Half | null
}

export interface CalendarPdfEntry {
  kind: PeriodKind
  half: Half | null
  page_id: string
}

/** 「何かある日」だけが返る (勤務日は含まれない) */
export interface CalendarDay {
  date: string
  ichiban: CalendarIchibanEntry[]
  pdf: CalendarPdfEntry[]
  status: DayStatus
}

export interface CalendarResponse {
  employee_cd: string
  employee_name: string | null
  month: string
  days: CalendarDay[]
  yukyu: {
    as_of: string
    remaining: number
    expired: number
    unallocated: number
    consumption_from: string
  }
  rousai: { year: number, month: number }
  unknown_items: number
}

export type GrantSource = 'auto' | 'manual'

/** 付与台帳の 1 行 (一覧の応答。POST / PUT の応答には used / remaining / expired が無い) */
export interface LeaveGrant {
  id: string
  employee_cd: string
  grant_date: string
  days: number
  expires_on: string
  source: GrantSource
  note: string | null
  created_at: string
  updated_at: string
  used?: number
  remaining?: number
  expired?: number
  /** 期首残があり付与日が期首日以前 (計算から外れている)。一覧の応答だけに付く */
  superseded?: boolean
}

/** 期首残から合成した付与 2 件 (繰越は前年の付与、今年度は直近の付与。0 日でも付く) */
export interface GrantsOpening {
  as_of: string
  carryover: number
  current: number
  carryover_grant_date: string | null
  carryover_expires_on: string | null
  current_grant_date: string | null
  current_expires_on: string | null
}

export interface GrantBalance {
  as_of: string
  remaining: number
  expired: number
  unallocated: number
  consumption_from: string
}

export interface GrantsResponse {
  employee_cd: string
  employee_name: string | null
  hire_date: string | null
  balance: GrantBalance
  opening: GrantsOpening | null
  data: LeaveGrant[]
}

/** 期首残の保存値 (期首日 `as_of` 時点の、前年からの繰越と今年度の付与の残) */
export interface OpeningValue {
  as_of: string
  carryover: number
  current: number
}

/** 期首残の一覧の 1 行 (乗務員は tenant の部門で絞った一番星の一覧) */
export interface OpeningRow {
  employee_cd: string
  employee_name: string | null
  dept_code: string | number | null
  hire_date: string | null
  retire_date: string | null
  opening: OpeningValue | null
}

/** 保存の 1 行 (両方 null = 削除、片方 null は 0) */
export interface OpeningPutRow {
  employee_cd: string
  carryover: number | null
  current: number | null
}

export interface OpeningPutBody {
  as_of: string
  rows: OpeningPutRow[]
}

export interface OpeningPutResponse {
  saved: number
  deleted: number
}

export interface GrantCreateBody {
  employee_cd: string
  grant_date: string
  days: number
  expires_on: string | null
  note: string | null
}

export interface GrantUpdateBody {
  days: number
  expires_on: string
  note: string | null
}

export interface AutoGrantsResponse {
  employee_cd: string
  hire_date: string | null
  inserted: number
  computed: { grant_date: string, days: number, expires_on: string }[]
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number>
  responseType?: 'json' | 'arrayBuffer'
  headers?: Record<string, string>
}

export type Fetcher = <T>(url: string, options?: FetchOptions) => Promise<T>

export const PAGE_LIMIT = 50

export interface ListPagesParams {
  status?: PageStatus
  /** 指定すると、その PDF のページだけが page_no 順で返る (1 PDF は最大 50 ページ) */
  r2_key?: string
  limit?: number
  offset?: number
}

export function listPagesQuery(p: ListPagesParams): Record<string, string | number> {
  const q: Record<string, string | number> = { limit: p.limit ?? PAGE_LIMIT, offset: p.offset ?? 0 }
  if (p.status) q.status = p.status
  if (p.r2_key) q.r2_key = p.r2_key
  return q
}

/** 一覧の絞り込み: open = 未紐づけのページがある PDF、done = 全ページが紐づけ済みか対象外 */
export type DocState = 'open' | 'done' | 'all'

/** PDF 1 件 (`GET /api/leave/documents` の 1 行) */
export interface LeaveDocument {
  r2_key: string
  first_page_id: string
  received_at: string
  page_count: number
  unlinked_count: number
  linked_count: number
  ignored_count: number
}

export interface ListDocumentsParams {
  state?: DocState
  limit?: number
  offset?: number
}

export function listDocumentsQuery(p: ListDocumentsParams): Record<string, string | number> {
  return { state: p.state ?? 'open', limit: p.limit ?? PAGE_LIMIT, offset: p.offset ?? 0 }
}

export function pageUrl(id: string): string {
  return `${API_BASE}/leave/pages/${encodeURIComponent(id)}`
}

export function pagePdfUrl(id: string): string {
  return `${pageUrl(id)}/pdf`
}

export function grantUrl(id: string): string {
  return `${API_BASE}/leave/grants/${encodeURIComponent(id)}`
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
    async listDocuments(p: ListDocumentsParams = {}): Promise<LeaveDocument[]> {
      const r = await fetcher<{ data: LeaveDocument[] }>(`${API_BASE}/leave/documents`, {
        query: listDocumentsQuery(p),
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
    uploadPdf(file: Blob): Promise<{ pages: number }> {
      return fetcher<{ pages: number }>(`${API_BASE}/leave/uploads`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      })
    },
    async listEmployees(): Promise<Employee[]> {
      const r = await fetcher<{ data: Employee[] }>(`${API_BASE}/leave/employees`)
      return r.data
    },
    async listDepartments(): Promise<Department[]> {
      const r = await fetcher<{ data: Department[] }>(`${API_BASE}/leave/departments`)
      return r.data
    },
    async listAlerts(): Promise<LeaveAlert[]> {
      const r = await fetcher<{ alerts: LeaveAlert[] }>(`${API_BASE}/leave/alerts`)
      return r.alerts
    },
    getCalendar(employeeCd: string, month: string): Promise<CalendarResponse> {
      return fetcher<CalendarResponse>(`${API_BASE}/leave/calendar`, {
        query: { employee_cd: employeeCd, month },
      })
    },
    listGrants(employeeCd: string): Promise<GrantsResponse> {
      return fetcher<GrantsResponse>(`${API_BASE}/leave/grants`, { query: { employee_cd: employeeCd } })
    },
    createGrant(body: GrantCreateBody): Promise<LeaveGrant> {
      return fetcher<LeaveGrant>(`${API_BASE}/leave/grants`, { method: 'POST', body })
    },
    updateGrant(id: string, body: GrantUpdateBody): Promise<LeaveGrant> {
      return fetcher<LeaveGrant>(grantUrl(id), { method: 'PUT', body })
    },
    deleteGrant(id: string): Promise<unknown> {
      return fetcher(grantUrl(id), { method: 'DELETE' })
    },
    autoGrants(employeeCd: string): Promise<AutoGrantsResponse> {
      return fetcher<AutoGrantsResponse>(`${API_BASE}/leave/grants/auto`, {
        method: 'POST',
        query: { employee_cd: employeeCd },
      })
    },
    async listOpening(): Promise<OpeningRow[]> {
      const r = await fetcher<{ data: OpeningRow[] }>(`${API_BASE}/leave/opening`)
      return r.data
    },
    saveOpening(body: OpeningPutBody): Promise<OpeningPutResponse> {
      return fetcher<OpeningPutResponse>(`${API_BASE}/leave/opening`, { method: 'PUT', body })
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
    testNotify(): Promise<unknown> {
      return fetcher(`${API_BASE}/leave/settings/test-notify`, { method: 'POST' })
    },
    listChannels(): Promise<LineworksChannel[]> {
      return fetcher<LineworksChannel[]>(`${API_BASE}/notify/lineworks/channels`)
    },
    listRecipients(): Promise<NotifyRecipient[]> {
      return fetcher<NotifyRecipient[]>(`${API_BASE}/notify/recipients`)
    },
  }
}

export type LeaveApi = ReturnType<typeof createLeaveApi>

const TOO_LARGE_MESSAGE = '10MB を超えています'

/** back が返すエラーの語 (`{"error":"..."}`) を画面の文にする */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_body: '入力が正しくありません',
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
  invalid_grace_days: '警告の猶予日数は 0〜60 です',
  unknown_lineworks_channel: '通知先グループが見つかりません',
  unknown_notify_recipient: '選んだ個人が見つかりません',
  unknown_notify_bot: '選んだ bot が使えません',
  notify_bot_without_recipient: 'bot は個人を選んだときだけ指定できます',
  both_notify_targets: '通知先は 1 つだけ選んでください',
  no_notify_target: '通知先が保存されていません',
  notify_failed: '送信に失敗しました',
  notify_unavailable: 'この環境では送れません',
  ichiban_not_configured: '一番星につながっていません (この環境では社員・部門を読めません)',
  ichiban_upstream: '一番星から社員・部門を読めませんでした',
  ichiban_unavailable: '一番星から社員・部門を読めませんでした',
  ichiban_bad_response: '一番星の応答が読めませんでした',
  invalid_month: '月の形が正しくありません',
  grant_exists: '同じ付与日の行があります',
  invalid_days: '日数は 0〜999.9 (小数 1 桁) で入れてください',
  invalid_grant_date: '付与日が正しくありません',
  expires_before_grant: '期限が付与日より前です',
  invalid_as_of: '期首日が正しくありません',
  too_many_rows: '一度に保存できるのは 1000 人までです',
  unknown_employee: '部門外か存在しない乗務員が含まれています',
  opening_no_prior_grant: '前年の付与が無いので繰越は入れられません',
  opening_no_current_grant: '今年度の付与が無いので今年度分は入れられません',
  not_found: '見つかりません',
  pdf_not_found: 'PDF が見つかりません',
  internal_error: 'サーバーでエラーが起きました',
  not_pdf: 'PDF ではありません',
  pdf_too_large: TOO_LARGE_MESSAGE,
  unreadable_pdf: 'PDF を読めませんでした',
  too_many_pages: 'ページが多すぎます (50 ページまで)',
  ingest_failed: '取り込みに失敗しました。少し待ってからやり直してください',
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
  // 413 は本文が JSON でない (back の body 上限)
  if (errorStatus(e) === 413) return TOO_LARGE_MESSAGE
  if (!e || typeof e !== 'object') return String(e)
  const f = e as FetchErrorLike
  const code = f.data?.error
  if (typeof code === 'string') return ERROR_MESSAGES[code] ?? code
  if (typeof f.data?.message === 'string') return f.data.message
  if (typeof f.message === 'string' && f.message) return f.message
  return 'エラーが起きました'
}
