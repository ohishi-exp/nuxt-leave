/**
 * 紐づけ画面のフォーム (乗務員・期間・備考) の検証と、PUT body への変換。
 * 規則は back (rust-leave-worker の pages.rs) と同じ: 逆順不可・半日は単日だけ・
 * linked は乗務員と期間 1 行以上が必須。
 */
import type { Half, LeavePeriod, PageStatus, PageUpdateBody, PeriodKind } from './leave-api'

export const PERIOD_KINDS: { value: PeriodKind, label: string }[] = [
  { value: 'yukyu', label: '有休' },
  { value: 'rousai', label: '労災' },
  { value: 'tokukyu', label: '特別休暇' },
  { value: 'kekkin', label: '欠勤' },
]

export const HALF_OPTIONS: { value: '' | Half, label: string }[] = [
  { value: '', label: 'なし' },
  { value: 'am', label: '午前' },
  { value: 'pm', label: '午後' },
]

export function kindLabel(kind: string): string {
  return PERIOD_KINDS.find(k => k.value === kind)?.label ?? kind
}

/** フォームの期間 1 行 (日付は `YYYY-MM-DD`、未入力は空文字) */
export interface PeriodRow {
  kind: PeriodKind
  start_date: string
  end_date: string
  half: '' | Half
}

export interface LinkForm {
  employee_cd: string
  note: string
  periods: PeriodRow[]
}

export function newPeriodRow(): PeriodRow {
  return { kind: 'yukyu', start_date: '', end_date: '', half: '' }
}

/** 半日を選べるのは開始日 = 終了日 (どちらも入力済み) のときだけ */
export function canSelectHalf(row: PeriodRow): boolean {
  return row.start_date !== '' && row.start_date === row.end_date
}

/** 開始日だけ入れたら終了日にも同じ日を入れ、単日でなくなったら半日を外す */
export function normalizePeriodRow(row: PeriodRow): PeriodRow {
  const end_date = row.end_date === '' ? row.start_date : row.end_date
  const next = { ...row, end_date }
  return canSelectHalf(next) ? next : { ...next, half: '' }
}

/** 期間 1 行の問題を文にする (問題なければ null)。`YYYY-MM-DD` は文字列比較で前後が決まる */
export function periodRowError(row: PeriodRow): string | null {
  if (row.start_date === '' || row.end_date === '') return '開始日と終了日を入れてください'
  if (row.end_date < row.start_date) return '終了日が開始日より前です'
  if (row.half !== '' && row.start_date !== row.end_date) {
    return '半日は開始日と終了日が同じ日のときだけ選べます'
  }
  return null
}

/** 保存する前のフォームの問題 (空なら保存してよい) */
export function validateLinkForm(form: LinkForm, status: PageStatus): string[] {
  const errors: string[] = []
  if (status === 'linked') {
    if (form.employee_cd.trim() === '') errors.push('乗務員を選んでください')
    if (form.periods.length === 0) errors.push('期間を 1 行以上入れてください')
  }
  form.periods.forEach((row, i) => {
    const err = periodRowError(row)
    if (err) errors.push(`期間 ${i + 1} 行目: ${err}`)
  })
  return errors
}

export function toPeriodBody(row: PeriodRow): LeavePeriod {
  return {
    kind: row.kind,
    start_date: row.start_date,
    end_date: row.end_date,
    half: row.half === '' ? null : row.half,
  }
}

export function toPageUpdateBody(form: LinkForm, status: PageStatus): PageUpdateBody {
  const cd = form.employee_cd.trim()
  const note = form.note.trim()
  return {
    employee_cd: cd === '' ? null : cd,
    status,
    note: note === '' ? null : note,
    periods: form.periods.map(toPeriodBody),
  }
}

/** 取得したページ (と期間) をフォームの初期値にする */
export function linkFormFromPage(page: {
  employee_cd: string | null
  note: string | null
  periods: LeavePeriod[]
}): LinkForm {
  return {
    employee_cd: page.employee_cd ?? '',
    note: page.note ?? '',
    periods: page.periods.map(p => ({
      kind: p.kind,
      start_date: p.start_date,
      end_date: p.end_date,
      half: p.half ?? '',
    })),
  }
}
