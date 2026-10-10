/**
 * 乗務員 (一番星の社員) の選択肢の表示と検索。
 * 表示は「社員C 氏名」、退職日がある人は末尾に (退職)。
 */
import type { Employee } from './leave-api'

export interface EmployeeOption {
  value: string
  label: string
  retired: boolean
}

export function isRetired(e: Employee): boolean {
  return typeof e.retire_date === 'string' && e.retire_date.trim() !== ''
}

export function employeeLabel(e: Employee): string {
  const name = e.employee_name?.trim() ?? ''
  const base = name === '' ? e.employee_code : `${e.employee_code} ${name}`
  return isRetired(e) ? `${base} (退職)` : base
}

/** 全角/半角・大小文字・空白の違いを無視して比べるための形 */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** 社員C か氏名に検索語を含む人だけを残す (空の検索語なら全員)。在籍者を先、各々は社員C 順 */
export function searchEmployees(list: Employee[], query: string): Employee[] {
  const q = normalizeForSearch(query)
  const hit = q === ''
    ? list
    : list.filter(e =>
        normalizeForSearch(e.employee_code).includes(q)
        || normalizeForSearch(e.employee_name ?? '').includes(q),
      )
  return [...hit].sort((a, b) => {
    const r = Number(isRetired(a)) - Number(isRetired(b))
    return r !== 0 ? r : a.employee_code.localeCompare(b.employee_code, 'ja', { numeric: true })
  })
}

export function toEmployeeOptions(list: Employee[]): EmployeeOption[] {
  return list.map(e => ({ value: e.employee_code, label: employeeLabel(e), retired: isRetired(e) }))
}

/** 社員C から表示名を引く (一覧に居なければ社員C のまま) */
export function employeeLabelByCode(list: Employee[], code: string | null): string {
  if (!code) return ''
  const e = list.find(x => x.employee_code === code)
  return e ? employeeLabel(e) : code
}
