import { describe, it, expect } from 'vitest'
import {
  autoResultMessage,
  BALANCE_NOTE,
  editNotice,
  emptyGrantForm,
  formatDays,
  grantFormFromGrant,
  isDate,
  NOTE_MAX_CHARS,
  parseDays,
  sourceLabel,
  toCreateBody,
  toUpdateBody,
  validateGrantForm,
} from '~/utils/grants'

const form = (o: Partial<ReturnType<typeof emptyGrantForm>> = {}) => ({
  ...emptyGrantForm(),
  grant_date: '2026-04-01',
  days: '10',
  ...o,
})

describe('日付と日数', () => {
  it('isDate は実在する日だけ', () => {
    expect(isDate('2026-02-28')).toBe(true)
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('2026-2-3')).toBe(false)
    expect(isDate('')).toBe(false)
  })

  it('parseDays は 0〜999.9 の小数 1 桁', () => {
    expect(parseDays('0')).toBe(0)
    expect(parseDays(' 10.5 ')).toBe(10.5)
    expect(parseDays('999.9')).toBe(999.9)
    expect(parseDays('1000')).toBeNull()
    expect(parseDays('1.25')).toBeNull()
    expect(parseDays('-1')).toBeNull()
    expect(parseDays('')).toBeNull()
    expect(parseDays('abc')).toBeNull()
  })

  it('formatDays', () => {
    expect(formatDays(10)).toBe('10')
    expect(formatDays(10.5)).toBe('10.5')
    expect(formatDays(0.1 + 0.2)).toBe('0.3')
  })
})

describe('validateGrantForm', () => {
  it('新規: 付与日・日数が要る、期限は省略可', () => {
    expect(validateGrantForm(form(), 'create')).toEqual([])
    expect(validateGrantForm(emptyGrantForm(), 'create')).toEqual([
      '付与日を入れてください',
      '日数は 0〜999.9 (小数 1 桁) で入れてください',
    ])
  })

  it('新規: 期限が付与日以前・不正な日付', () => {
    expect(validateGrantForm(form({ expires_on: '2026-04-01' }), 'create')).toEqual(['期限が付与日より前です'])
    expect(validateGrantForm(form({ expires_on: '2026-13-01' }), 'create')).toEqual(['期限が正しい日付ではありません'])
    expect(validateGrantForm(form({ expires_on: '2028-04-01' }), 'create')).toEqual([])
  })

  it('編集: 付与日は見ない、期限が要る', () => {
    expect(validateGrantForm(form({ grant_date: '' }), 'update')).toEqual(['期限を入れてください'])
    expect(validateGrantForm(form({ grant_date: '', expires_on: '2028-04-01' }), 'update')).toEqual([])
  })

  it('備考の長さ', () => {
    const long = form({ note: 'あ'.repeat(NOTE_MAX_CHARS + 1) })
    expect(validateGrantForm(long, 'create')).toEqual([`備考は ${NOTE_MAX_CHARS} 字までです`])
    expect(validateGrantForm(form({ note: 'あ'.repeat(NOTE_MAX_CHARS) }), 'create')).toEqual([])
  })
})

describe('body', () => {
  it('新規: 期限と備考が空なら null', () => {
    expect(toCreateBody(form({ days: ' 5.5 ' }), '101')).toEqual({
      employee_cd: '101', grant_date: '2026-04-01', days: 5.5, expires_on: null, note: null,
    })
    expect(toCreateBody(form({ expires_on: '2028-04-01', note: ' 繰越 ' }), '101')).toEqual({
      employee_cd: '101', grant_date: '2026-04-01', days: 10, expires_on: '2028-04-01', note: '繰越',
    })
  })

  it('検証前の不正な日数は 0 に落ちる (送る前に validate する前提)', () => {
    expect(toCreateBody(form({ days: 'x' }), '1').days).toBe(0)
    expect(toUpdateBody(form({ days: 'x', expires_on: '2028-04-01' })).days).toBe(0)
  })

  it('編集は days / expires_on / note だけ', () => {
    expect(toUpdateBody(form({ days: '3', expires_on: ' 2028-04-01 ', note: '' }))).toEqual({
      days: 3, expires_on: '2028-04-01', note: null,
    })
  })

  it('行からフォームへ', () => {
    expect(grantFormFromGrant({ grant_date: '2026-04-01', days: 11, expires_on: '2028-04-01', note: null })).toEqual({
      grant_date: '2026-04-01', days: '11', expires_on: '2028-04-01', note: '',
    })
    expect(grantFormFromGrant({ grant_date: '2026-04-01', days: 0.5, expires_on: '2028-04-01', note: 'x' }).note).toBe('x')
  })
})

describe('表示', () => {
  it('source', () => {
    expect(sourceLabel('auto')).toBe('自動')
    expect(sourceLabel('manual')).toBe('手動')
    expect(sourceLabel('other')).toBe('other')
  })

  it('自動の行を編集する旨', () => {
    expect(editNotice('auto')).toContain('手動の行になり')
    expect(editNotice('manual')).toBeNull()
  })

  it('自動付与の結果', () => {
    expect(autoResultMessage({ hire_date: null, inserted: 0 })).toBe('入社日が無いので計算できません')
    expect(autoResultMessage({ hire_date: '2020-04-01', inserted: 0 })).toBe('追加する付与はありませんでした')
    expect(autoResultMessage({ hire_date: '2020-04-01', inserted: 3 })).toBe('3 件の付与を追加しました')
  })

  it('残の注記', () => {
    expect(BALANCE_NOTE).toContain('近似')
  })
})
