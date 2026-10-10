/**
 * 乗務員ごとの月カレンダー画面の表示ロジック。
 * back の `days` は「一番星か申請書に何かある日」だけなので、月の全日を作って差し込む。
 */
import type { CalendarDay, CalendarIchibanEntry, CalendarPdfEntry, DayStatus, Half } from './leave-api'
import { kindLabel } from './leave-periods'

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v)
}

/** 今日 (JST) の月 `YYYY-MM` */
export function currentMonth(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 月を前後にずらす (`delta` は月数、負で前) */
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month)
  if (!m) return month
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}

export function daysInMonth(month: string): number {
  const m = MONTH_RE.exec(month)
  if (!m) return 0
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
}

/** 月初の曜日 (0 = 日曜) */
export function firstWeekday(month: string): number {
  const m = MONTH_RE.exec(month)
  if (!m) return 0
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).getUTCDay()
}

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export interface DayCell {
  date: string
  day: number
  /** 0 = 日曜 */
  weekday: number
  /** back が返した「何かある日」。無ければ null (勤務日) */
  entry: CalendarDay | null
}

/** 月の全日を作り、back の日を差し込む */
export function buildMonthDays(month: string, days: CalendarDay[]): DayCell[] {
  const byDate = new Map(days.map(d => [d.date, d]))
  const first = firstWeekday(month)
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = `${month}-${pad(i + 1)}`
    return { date, day: i + 1, weekday: (first + i) % 7, entry: byDate.get(date) ?? null }
  })
}

/** 週ごとの表にするための行 (先頭と末尾は null で埋める) */
export function buildWeeks(cells: DayCell[]): (DayCell | null)[][] {
  if (cells.length === 0) return []
  const padded: (DayCell | null)[] = [...Array<null>(cells[0]!.weekday).fill(null), ...cells]
  while (padded.length % 7 !== 0) padded.push(null)
  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))
  return weeks
}

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  match: '一致',
  ichiban_only: '一番星だけ',
  pdf_only: '申請書だけ',
  mismatch: '区分が違う',
}

export function dayStatusLabel(status: string): string {
  return DAY_STATUS_LABELS[status as DayStatus] ?? status
}

/** UBadge の color と、日のマスの枠色 */
const STATUS_COLORS: Record<DayStatus, 'success' | 'warning' | 'info' | 'error'> = {
  match: 'success',
  ichiban_only: 'warning',
  pdf_only: 'info',
  mismatch: 'error',
}

export function dayStatusColor(status: string): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  return STATUS_COLORS[status as DayStatus] ?? 'neutral'
}

const CELL_CLASSES: Record<DayStatus, string> = {
  match: 'border-(--ui-success) bg-(--ui-success)/10',
  ichiban_only: 'border-(--ui-warning) bg-(--ui-warning)/10',
  pdf_only: 'border-(--ui-info) bg-(--ui-info)/10',
  mismatch: 'border-(--ui-error) bg-(--ui-error)/10',
}

/** 日のマスの枠・背景。何も無い日 (勤務日) は素のまま */
export function dayCellClass(entry: CalendarDay | null): string {
  if (!entry) return 'border-(--ui-border) bg-(--ui-bg)'
  return CELL_CLASSES[entry.status] ?? 'border-(--ui-border) bg-(--ui-bg)'
}

const HALF_LABELS: Record<Half, string> = { am: '午前', pm: '午後' }

export function halfLabel(half: Half | null): string {
  return half ? HALF_LABELS[half] : ''
}

/** 「有休 午前」のように区分と半日を 1 つの文にする */
export function entryLabel(e: CalendarIchibanEntry | CalendarPdfEntry): string {
  const h = halfLabel(e.half)
  return h === '' ? kindLabel(e.kind) : `${kindLabel(e.kind)} ${h}`
}

export function monthTitle(month: string): string {
  const m = MONTH_RE.exec(month)
  return m ? `${m[1]}年${Number(m[2])}月` : month
}

/** 日のマスの曜日色 (日曜 = 赤、土曜 = 青) */
export function weekdayClass(weekday: number): string {
  if (weekday === 0) return 'text-(--ui-error)'
  if (weekday === 6) return 'text-(--ui-info)'
  return ''
}
