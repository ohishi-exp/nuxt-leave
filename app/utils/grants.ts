/**
 * 有給付与台帳の画面のフォーム検証と body 組み立て、表示。
 * 規則は back (rust-leave-worker の grants.rs) と同じ: 日数は 0〜999.9 の小数 1 桁、
 * 期限は付与日より後 (新規は省略すると付与日 + 2 年)、備考は 2000 字まで。
 */
import type {
  AutoGrantsResponse,
  GrantCreateBody,
  GrantSource,
  GrantUpdateBody,
  GrantsOpening,
  LeaveGrant,
} from './leave-api'

export const NOTE_MAX_CHARS = 2000

/** フォームの値 (日付は `YYYY-MM-DD`、未入力は空文字、日数は入力のままの文字列) */
export interface GrantForm {
  grant_date: string
  days: string
  expires_on: string
  note: string
}

export function emptyGrantForm(): GrantForm {
  return { grant_date: '', days: '', expires_on: '', note: '' }
}

export function grantFormFromGrant(g: Pick<LeaveGrant, 'grant_date' | 'days' | 'expires_on' | 'note'>): GrantForm {
  return {
    grant_date: g.grant_date,
    days: formatDays(g.days),
    expires_on: g.expires_on,
    note: g.note ?? '',
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 実在する `YYYY-MM-DD` か */
export function isDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const DAYS_ERROR = '日数は 0〜999.9 (小数 1 桁) で入れてください'

const DAYS_RE = /^\d{1,3}(\.\d)?$/

/** 日数の入力を数にする (0〜999.9、小数 1 桁まで。ダメなら null) */
export function parseDays(raw: string): number | null {
  const s = raw.trim()
  return DAYS_RE.test(s) ? Number(s) : null
}

/** 日数の表示: 整数は小数点なし、そうでなければ 1 桁 */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** 保存する前のフォームの問題 (空なら保存してよい)。付与日は新規 (`create`) のときだけ見る */
export function validateGrantForm(form: GrantForm, mode: 'create' | 'update'): string[] {
  const errors: string[] = []
  if (mode === 'create' && !isDate(form.grant_date)) errors.push('付与日を入れてください')
  if (parseDays(form.days) === null) errors.push(DAYS_ERROR)
  const exp = form.expires_on.trim()
  if (mode === 'update' && exp === '') errors.push('期限を入れてください')
  if (exp !== '' && !isDate(exp)) errors.push('期限が正しい日付ではありません')
  if (mode === 'create' && isDate(form.grant_date) && isDate(exp) && exp <= form.grant_date) {
    errors.push('期限が付与日より前です')
  }
  if ([...form.note].length > NOTE_MAX_CHARS) errors.push(`備考は ${NOTE_MAX_CHARS} 字までです`)
  return errors
}

function noteOf(form: GrantForm): string | null {
  const n = form.note.trim()
  return n === '' ? null : n
}

/** 新規の body (期限が空なら null = back が付与日 + 2 年にする) */
export function toCreateBody(form: GrantForm, employeeCd: string): GrantCreateBody {
  const exp = form.expires_on.trim()
  return {
    employee_cd: employeeCd,
    grant_date: form.grant_date,
    days: parseDays(form.days) ?? 0,
    expires_on: exp === '' ? null : exp,
    note: noteOf(form),
  }
}

/** 編集の body (PUT は days / expires_on / note の全置換。付与日は送れない) */
export function toUpdateBody(form: GrantForm): GrantUpdateBody {
  return {
    days: parseDays(form.days) ?? 0,
    expires_on: form.expires_on.trim(),
    note: noteOf(form),
  }
}

export function sourceLabel(source: GrantSource | string): string {
  if (source === 'auto') return '自動'
  if (source === 'manual') return '手動'
  return source
}

/** 自動の行を編集すると手動扱いになる旨 (手動の行なら null) */
export function editNotice(source: GrantSource | string): string | null {
  return source === 'auto'
    ? '自動で足した行を保存すると手動の行になり、以後の自動計算の対象外になります (付与日は変えられません)。'
    : null
}

/** 「法定の付与を自動で足す」の結果の文 */
export function autoResultMessage(r: Pick<AutoGrantsResponse, 'hire_date' | 'inserted'>): string {
  if (r.hire_date === null) return '入社日が無いので計算できません'
  if (r.inserted === 0) return '追加する付与はありませんでした'
  return `${r.inserted} 件の付与を追加しました`
}

export const BALANCE_NOTE
  = '残は近似です。一番星の休暇を基準日から 48 か月前までさかのぼって先に付いた付与から引いて数えています (入社日より前は数えません)。'

export const SUPERSEDED_LABEL = '期首残で置き換え'

/** 期首残から合成した付与の表示行 (一覧の先頭に出す。日付が無ければ null) */
export interface OpeningGrantRow {
  label: string
  grant_date: string | null
  days: number
  expires_on: string | null
}

export function openingGrantRows(o: GrantsOpening): OpeningGrantRow[] {
  return [
    { label: '期首残 (繰越)', grant_date: o.carryover_grant_date, days: o.carryover, expires_on: o.carryover_expires_on },
    { label: '期首残 (今年度)', grant_date: o.current_grant_date, days: o.current, expires_on: o.current_expires_on },
  ]
}
