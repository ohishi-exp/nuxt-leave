import { describe, it, expect } from 'vitest'
import { asOfFromQuery, fiscalYearLabel, shiftAsOf } from '~/utils/ledger-year'

describe('shiftAsOf', () => {
  it('月をずらす', () => {
    expect(shiftAsOf('2026-10-14', 'month', -1)).toBe('2026-09-14')
    expect(shiftAsOf('2026-10-14', 'month', 1)).toBe('2026-11-14')
  })
  it('年をまたぐ', () => {
    expect(shiftAsOf('2026-01-15', 'month', -1)).toBe('2025-12-15')
    expect(shiftAsOf('2026-12-15', 'month', 1)).toBe('2027-01-15')
  })
  it('月末は移動先の月の日数に丸める', () => {
    expect(shiftAsOf('2026-03-31', 'month', -1)).toBe('2026-02-28')
    expect(shiftAsOf('2028-03-31', 'month', -1)).toBe('2028-02-29')
    expect(shiftAsOf('2026-01-31', 'month', 3)).toBe('2026-04-30')
  })
  it('年をずらす (閏日は 2/28 へ)', () => {
    expect(shiftAsOf('2026-10-14', 'year', -1)).toBe('2025-10-14')
    expect(shiftAsOf('2026-10-14', 'year', 1)).toBe('2027-10-14')
    expect(shiftAsOf('2028-02-29', 'year', 1)).toBe('2029-02-28')
  })
})

describe('asOfFromQuery', () => {
  it('実在する日付ならそれ', () => {
    expect(asOfFromQuery('2026-04-01', '2026-10-14')).toBe('2026-04-01')
  })
  it('文字列でない・形が違う・実在しないなら today', () => {
    expect(asOfFromQuery(undefined, '2026-10-14')).toBe('2026-10-14')
    expect(asOfFromQuery(['2026-04-01'], '2026-10-14')).toBe('2026-10-14')
    expect(asOfFromQuery('2026/04/01', '2026-10-14')).toBe('2026-10-14')
    expect(asOfFromQuery('2026-02-30', '2026-10-14')).toBe('2026-10-14')
  })
})

describe('fiscalYearLabel', () => {
  it('年度と範囲', () => {
    expect(fiscalYearLabel({ start: '2026-04-01', end: '2027-03-31', label: '2026 年度' }))
      .toBe('2026 年度 (2026-04-01〜2027-03-31)')
  })
})
