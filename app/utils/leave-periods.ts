/**
 * 紐づけ画面のフォーム (乗務員・期間・備考) の検証と、PUT body への変換。
 * 期間は手で入れず、一番星の候補からチェックして選ぶ。
 * 規則は back (rust-leave-worker の pages.rs) と同じ: linked は乗務員と期間 1 行以上が必須。
 */
import type { Half, IchibanCandidatePeriod, LeavePeriod, PageStatus, PageUpdateBody, PeriodKind } from './leave-api'

export const PERIOD_KINDS: { value: PeriodKind, label: string }[] = [
  { value: 'yukyu', label: '有休' },
  { value: 'rousai', label: '労災' },
  { value: 'tokukyu', label: '特別休暇' },
  { value: 'kekkin', label: '欠勤' },
]

export function kindLabel(kind: string): string {
  return PERIOD_KINDS.find(k => k.value === kind)?.label ?? kind
}

/** 保存する中身 (期間は候補のチェックから作る) */
export interface LinkForm {
  employee_cd: string
  note: string
  periods: LeavePeriod[]
  /** 期間にした一番星の行 ID (保存済みの期間をそのまま送るときは空) */
  ichiban_row_ids: string[]
}

/** 候補を見分ける印 (候補に含まれる一番星の row_id を並べた文字列) */
export function candidateKey(p: IchibanCandidatePeriod): string {
  return p.rows.map(r => r.row_id).join(',')
}

/** 期間 1 つの表示: `区分 開始日〜終了日 (午前/午後)`。単日は日付 1 つ */
export function periodLabel(p: { kind: string, start_date: string, end_date: string, half: Half | null }): string {
  const days = p.start_date === p.end_date ? p.start_date : `${p.start_date}〜${p.end_date}`
  const half = p.half === 'am' ? ' (午前)' : p.half === 'pm' ? ' (午後)' : ''
  return `${kindLabel(p.kind)} ${days}${half}`
}

/** 候補が 1 つだけで、保存済みの期間も無いときだけ最初からチェックする */
export function initialCheckedKeys(candidates: IchibanCandidatePeriod[], saved: LeavePeriod[]): string[] {
  const only = candidates.length === 1 && saved.length === 0 ? candidates[0] : undefined
  return only ? [candidateKey(only)] : []
}

/**
 * チェックした候補 → 保存する期間と一番星の行 ID。
 * 1 つもチェックが無ければ保存済みの期間をそのまま (行 ID は送らない)。
 */
export function selectedPeriods(
  checked: string[],
  candidates: IchibanCandidatePeriod[],
  saved: LeavePeriod[],
): { periods: LeavePeriod[], ichiban_row_ids: string[] } {
  const picked = candidates.filter(p => checked.includes(candidateKey(p)))
  if (picked.length === 0) return { periods: saved, ichiban_row_ids: [] }
  return {
    periods: picked.map(p => ({ kind: p.kind, start_date: p.start_date, end_date: p.end_date, half: p.half })),
    ichiban_row_ids: [...new Set(picked.flatMap(p => p.rows.map(r => r.row_id)))],
  }
}

/** 保存する前のフォームの問題 (空なら保存してよい) */
export function validateLinkForm(form: LinkForm, status: PageStatus): string[] {
  const errors: string[] = []
  if (status === 'linked') {
    if (form.employee_cd.trim() === '') errors.push('乗務員を選んでください')
    if (form.periods.length === 0) errors.push('一番星の候補を 1 つ以上選んでください。無ければ一番星に記録を足してください')
  }
  return errors
}

export function toPageUpdateBody(form: LinkForm, status: PageStatus): PageUpdateBody {
  const cd = form.employee_cd.trim()
  const note = form.note.trim()
  const body: PageUpdateBody = {
    employee_cd: cd === '' ? null : cd,
    status,
    note: note === '' ? null : note,
    periods: form.periods,
  }
  if (status === 'linked' && form.ichiban_row_ids.length > 0) body.ichiban_row_ids = form.ichiban_row_ids
  return body
}

/** キーボード操作の結果 (キーを押した場所と状態から決める) */
export type RowKeyAction =
  | { type: 'move', delta: -1 | 1 }
  | { type: 'toggle-focused' }
  | { type: 'toggle', index: number }
  | { type: 'link' }
  | { type: 'ignore' }

export interface RowKeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  /** キーを押した場所。備考など他の入力欄は 'other' (ショートカットを効かせない) */
  zone: 'candidates' | 'employee' | 'other'
  /** 乗務員の選択メニューが開いている (Enter は選択に使われる) */
  menuOpen: boolean
  candidateCount: number
}

/** 1 行の中のキー操作: ↑↓ 移動 / Space・1〜9 選択 / Enter 紐づける / Ctrl(⌘)+Enter 対象外 */
export function rowKeyAction(i: RowKeyInput): RowKeyAction | null {
  if (i.zone === 'other' || i.menuOpen) return null
  if (i.key === 'Enter') return i.ctrlKey || i.metaKey ? { type: 'ignore' } : { type: 'link' }
  if (i.zone !== 'candidates') return null
  if (i.key === 'ArrowUp') return { type: 'move', delta: -1 }
  if (i.key === 'ArrowDown') return { type: 'move', delta: 1 }
  if (i.key === ' ') return { type: 'toggle-focused' }
  const n = /^[1-9]$/.test(i.key) ? Number(i.key) : 0
  return n >= 1 && n <= i.candidateCount ? { type: 'toggle', index: n - 1 } : null
}
