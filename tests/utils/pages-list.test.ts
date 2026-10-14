import { describe, it, expect } from 'vitest'
import {
  effectiveBaseDate,
  formatDateTime,
  hasNextPage,
  isPageStatus,
  isTabValue,
  offsetFromQuery,
  statusLabel,
  STATUS_TABS,
  tabFromQuery,
} from '~/utils/pages-list'

describe('状態', () => {
  it('タブは 3 つ', () => {
    expect(STATUS_TABS.map(t => t.value)).toEqual(['unlinked', 'linked', 'ignored'])
  })

  it('statusLabel / isPageStatus', () => {
    expect(statusLabel('ignored')).toBe('対象外')
    expect(statusLabel('x')).toBe('x')
    expect(isPageStatus('linked')).toBe(true)
    expect(isPageStatus('x')).toBe(false)
    expect(isPageStatus(undefined)).toBe(false)
  })
})

describe('formatDateTime', () => {
  it('日本時間で表示', () => {
    expect(formatDateTime('2026-10-10T05:05:00Z')).toBe('2026/10/10 14:05')
  })

  it('空・読めない値', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})

describe('ページング', () => {
  it('件数が limit に届けば次がある', () => {
    expect(hasNextPage(50, 50)).toBe(true)
    expect(hasNextPage(49, 50)).toBe(false)
  })

  it('offset の query は正の整数だけ', () => {
    expect(offsetFromQuery('100')).toBe(100)
    expect(offsetFromQuery(undefined)).toBe(0)
    expect(offsetFromQuery('-5')).toBe(0)
    expect(offsetFromQuery('1.5')).toBe(0)
    expect(offsetFromQuery('abc')).toBe(0)
  })
})

describe('タブの値', () => {
  const tabs = [{ value: 'a' as const }, { value: 'b' as const }]

  it('isTabValue / tabFromQuery', () => {
    expect(isTabValue(tabs, 'b')).toBe(true)
    expect(isTabValue(tabs, 'c')).toBe(false)
    expect(tabFromQuery(tabs, 'b', 'a')).toBe('b')
    expect(tabFromQuery(tabs, ['b'], 'a')).toBe('a')
    expect(tabFromQuery(tabs, undefined, 'a')).toBe('a')
  })
})

describe('effectiveBaseDate', () => {
  it('基準日があればそれを返す', () => {
    expect(effectiveBaseDate({ base_date: '2026-10-01', received_at: '2026-10-10T05:05:00Z' })).toBe('2026-10-01')
  })

  it('無ければ受信日の JST の日 (UTC 15 時以降は翌日)', () => {
    expect(effectiveBaseDate({ base_date: null, received_at: '2026-10-10T05:05:00Z' })).toBe('2026-10-10')
    expect(effectiveBaseDate({ base_date: null, received_at: '2026-10-10T16:00:00Z' })).toBe('2026-10-11')
  })

  it('受信日が読めなければ空', () => {
    expect(effectiveBaseDate({ base_date: null, received_at: 'x' })).toBe('')
  })
})
