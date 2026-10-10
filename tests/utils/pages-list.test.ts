import { describe, it, expect } from 'vitest'
import { formatDateTime, hasNextPage, isPageStatus, nextUnlinkedId, statusLabel, STATUS_TABS } from '~/utils/pages-list'
import type { LeavePage } from '~/utils/leave-api'

const page = (id: string, status: LeavePage['status']): LeavePage => ({
  id,
  r2_key: `k/${id}`,
  page_no: 1,
  mail_from: null,
  subject: null,
  received_at: '2026-10-10T05:05:00Z',
  employee_cd: null,
  status,
  linked_by: null,
  linked_at: null,
  note: null,
  created_at: '2026-10-10T05:05:00Z',
})

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

describe('ページング・次のページ', () => {
  it('件数が limit に届けば次がある', () => {
    expect(hasNextPage(50, 50)).toBe(true)
    expect(hasNextPage(49, 50)).toBe(false)
  })

  it('今のページ以外の最初の未紐づけ', () => {
    const list = [page('a', 'unlinked'), page('b', 'linked'), page('c', 'unlinked')]
    expect(nextUnlinkedId(list, 'a')).toBe('c')
    expect(nextUnlinkedId(list, 'z')).toBe('a')
    expect(nextUnlinkedId([page('a', 'unlinked')], 'a')).toBeNull()
    expect(nextUnlinkedId([], 'a')).toBeNull()
  })
})
