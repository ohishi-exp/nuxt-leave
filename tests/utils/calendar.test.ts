import { describe, it, expect } from 'vitest'
import {
  buildMonthDays,
  buildWeeks,
  currentMonth,
  dayCellClass,
  dayStatusColor,
  dayStatusLabel,
  daysInMonth,
  entryLabel,
  firstWeekday,
  halfLabel,
  isMonth,
  monthTitle,
  shiftMonth,
  weekdayClass,
} from '~/utils/calendar'
import type { CalendarDay } from '~/utils/leave-api'

const day = (date: string, status: CalendarDay['status']): CalendarDay => ({ date, ichiban: [], pdf: [], status })

describe('月の判定と移動', () => {
  it('isMonth は YYYY-MM だけ通す', () => {
    expect(isMonth('2026-02')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-2')).toBe(false)
    expect(isMonth(undefined)).toBe(false)
    expect(isMonth(['2026-02'])).toBe(false)
  })

  it('currentMonth は JST で月を決める', () => {
    expect(currentMonth(new Date('2026-01-31T15:00:00Z'))).toBe('2026-02')
    expect(currentMonth(new Date('2026-01-31T14:59:00Z'))).toBe('2026-01')
  })

  it('shiftMonth は年をまたぐ', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-05', 0)).toBe('2026-05')
    expect(shiftMonth('bad', 1)).toBe('bad')
  })

  it('daysInMonth / firstWeekday', () => {
    expect(daysInMonth('2024-02')).toBe(29)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('bad')).toBe(0)
    expect(firstWeekday('2026-02')).toBe(0)
    expect(firstWeekday('2026-10')).toBe(4)
    expect(firstWeekday('bad')).toBe(0)
  })

  it('monthTitle', () => {
    expect(monthTitle('2026-02')).toBe('2026年2月')
    expect(monthTitle('x')).toBe('x')
  })
})

describe('月の全日', () => {
  it('back の日を差し込み、無い日は entry が null', () => {
    const d = day('2026-02-03', 'match')
    const cells = buildMonthDays('2026-02', [d])
    expect(cells).toHaveLength(28)
    expect(cells[0]).toEqual({ date: '2026-02-01', day: 1, weekday: 0, entry: null })
    expect(cells[2]!.entry).toBe(d)
    expect(cells[27]!.weekday).toBe(6)
  })

  it('buildWeeks は先頭と末尾を null で埋めて 7 列にする', () => {
    const weeks = buildWeeks(buildMonthDays('2026-10', []))
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks[0]!.slice(0, 4)).toEqual([null, null, null, null])
    expect(weeks[0]![4]!.date).toBe('2026-10-01')
    expect(weeks.at(-1)!.at(-1)!.date).toBe('2026-10-31')
  })

  it('末尾は null で埋める', () => {
    const weeks = buildWeeks(buildMonthDays('2026-11', []))
    expect(weeks).toHaveLength(5)
    expect(weeks.at(-1)!.slice(2)).toEqual([null, null, null, null, null])
  })

  it('ちょうど週で終わる月は末尾を埋めない', () => {
    const weeks = buildWeeks(buildMonthDays('2026-02', []))
    expect(weeks).toHaveLength(4)
    expect(weeks.flat().every(c => c !== null)).toBe(true)
  })

  it('空は空', () => {
    expect(buildWeeks([])).toEqual([])
  })
})

describe('状態の表示', () => {
  it('ラベルと色', () => {
    expect(dayStatusLabel('mismatch')).toBe('区分が違う')
    expect(dayStatusLabel('zzz')).toBe('zzz')
    expect(dayStatusColor('match')).toBe('success')
    expect(dayStatusColor('ichiban_only')).toBe('warning')
    expect(dayStatusColor('pdf_only')).toBe('info')
    expect(dayStatusColor('mismatch')).toBe('error')
    expect(dayStatusColor('zzz')).toBe('neutral')
  })

  it('マスの色', () => {
    expect(dayCellClass(null)).toContain('--ui-border')
    expect(dayCellClass(day('2026-02-01', 'mismatch'))).toContain('--ui-error')
    expect(dayCellClass({ ...day('2026-02-01', 'match'), status: 'zzz' as never })).toContain('--ui-border')
  })

  it('区分と半日', () => {
    expect(halfLabel(null)).toBe('')
    expect(halfLabel('am')).toBe('午前')
    expect(entryLabel({ kind: 'yukyu', half: null })).toBe('有休')
    expect(entryLabel({ kind: 'kekkin', half: 'pm', page_id: 'p' })).toBe('欠勤 午後')
  })

  it('曜日の色', () => {
    expect(weekdayClass(0)).toContain('error')
    expect(weekdayClass(6)).toContain('info')
    expect(weekdayClass(3)).toBe('')
  })
})
