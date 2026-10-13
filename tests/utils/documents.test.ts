import { describe, it, expect } from 'vitest'
import { DOC_TABS, nextUnlinkedIndex } from '~/utils/documents'
import type { PageStatus } from '~/utils/leave-api'

const rows = (...s: PageStatus[]) => s.map(status => ({ status }))

describe('DOC_TABS', () => {
  it('未完了 / 完了 / すべて', () => {
    expect(DOC_TABS.map(t => t.value)).toEqual(['open', 'done', 'all'])
    expect(DOC_TABS.map(t => t.label)).toEqual(['未完了', '完了', 'すべて'])
  })
})

describe('nextUnlinkedIndex', () => {
  it('後ろの最初の未紐づけ', () => {
    expect(nextUnlinkedIndex(rows('unlinked', 'linked', 'unlinked', 'unlinked'), 0)).toBe(2)
  })

  it('後ろに無ければ先頭から探す', () => {
    expect(nextUnlinkedIndex(rows('linked', 'unlinked', 'linked', 'ignored'), 2)).toBe(1)
  })

  it('自分の行は探さない (全部済みなら null)', () => {
    expect(nextUnlinkedIndex(rows('unlinked', 'linked'), 0)).toBeNull()
    expect(nextUnlinkedIndex(rows('linked', 'ignored'), 0)).toBeNull()
    expect(nextUnlinkedIndex([], 0)).toBeNull()
  })

  it('fromIndex が範囲外でも落ちない', () => {
    expect(nextUnlinkedIndex(rows('unlinked'), 5)).toBe(0)
    expect(nextUnlinkedIndex(rows('unlinked', 'linked'), -1)).toBe(0)
  })
})
