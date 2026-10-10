import { describe, it, expect } from 'vitest'
import {
  employeeLabel,
  employeeLabelByCode,
  isRetired,
  normalizeForSearch,
  searchEmployees,
  toEmployeeOptions,
} from '~/utils/employees'
import type { Employee } from '~/utils/leave-api'

const list: Employee[] = [
  { employee_code: '1100', employee_name: '山田 太郎', dept_code: '10', retire_date: '2025-03-31' },
  { employee_code: '1021', employee_name: '佐藤 花子', dept_code: '10', retire_date: null },
  { employee_code: '200', employee_name: 'ﾀﾅｶ ｲﾁﾛｳ', dept_code: 20 },
  { employee_code: '1050', employee_name: null },
]

describe('表示', () => {
  it('退職日があれば (退職)', () => {
    expect(isRetired(list[0]!)).toBe(true)
    expect(isRetired(list[1]!)).toBe(false)
    expect(isRetired({ employee_code: 'x', employee_name: 'y', retire_date: ' ' })).toBe(false)
    expect(employeeLabel(list[0]!)).toBe('1100 山田 太郎 (退職)')
    expect(employeeLabel(list[1]!)).toBe('1021 佐藤 花子')
  })

  it('氏名が無ければ社員C だけ', () => {
    expect(employeeLabel(list[3]!)).toBe('1050')
    expect(employeeLabel({ employee_code: '9', employee_name: '  ' })).toBe('9')
  })

  it('選択肢', () => {
    expect(toEmployeeOptions([list[0]!])).toEqual([{ value: '1100', label: '1100 山田 太郎 (退職)', retired: true }])
  })

  it('社員C から表示名', () => {
    expect(employeeLabelByCode(list, '1021')).toBe('1021 佐藤 花子')
    expect(employeeLabelByCode(list, '9999')).toBe('9999')
    expect(employeeLabelByCode(list, null)).toBe('')
  })
})

describe('検索', () => {
  it('normalize は全角/半角・空白・大小文字を寄せる', () => {
    expect(normalizeForSearch('ﾀﾅｶ ｲﾁﾛｳ')).toBe('タナカイチロウ')
    expect(normalizeForSearch('ＡＢ c')).toBe('abc')
  })

  it('空の検索語は全員 (在籍者が先、社員C の数値順)', () => {
    expect(searchEmployees(list, '  ').map(e => e.employee_code)).toEqual(['200', '1021', '1050', '1100'])
  })

  it('氏名で引ける (空白・半角カナを無視)', () => {
    expect(searchEmployees(list, '山田太郎').map(e => e.employee_code)).toEqual(['1100'])
    expect(searchEmployees(list, 'タナカ').map(e => e.employee_code)).toEqual(['200'])
  })

  it('社員C で引ける', () => {
    expect(searchEmployees(list, '10').map(e => e.employee_code)).toEqual(['1021', '1050', '1100'])
  })

  it('当たらなければ空', () => {
    expect(searchEmployees(list, 'zzz')).toEqual([])
  })

  it('元の配列を並べ替えない', () => {
    const copy = [...list]
    searchEmployees(list, '')
    expect(list).toEqual(copy)
  })
})
