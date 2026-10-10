/**
 * 期首残 (X 日時点の残) の一括入力のロジック。
 * 日数の規則は有給台帳 (grants.ts) と同じ: 0〜999.9、小数 1 桁。
 * 「両方空 = 削除」「片方空 = 0」は back (PUT /leave/opening) の規則。
 */
import { searchEmployees } from './employees'
import { DAYS_ERROR, formatDays, isDate, parseDays } from './grants'
import type { Department, Employee, OpeningPutRow, OpeningRow } from './leave-api'

/** 1 回の保存で送れる行数の上限 (back の too_many_rows) */
export const OPENING_MAX_ROWS = 1000

/** 表の入力欄の値 (入力のままの文字列、空は空文字) */
export interface OpeningInput {
  carryover: string
  current: string
}

export type OpeningInputs = Record<string, OpeningInput>

/** 全角・「12,5」を半角の小数点にそろえる */
export function normalizeDaysText(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/,/g, '.')
}

export type DaysParse = { ok: true, value: number | null } | { ok: false }

/** 日数の入力を読む (空は null = 未入力、ダメなら ok: false) */
export function parseDaysInput(raw: string): DaysParse {
  const s = normalizeDaysText(raw)
  if (s === '') return { ok: true, value: null }
  const n = parseDays(s)
  return n === null ? { ok: false } : { ok: true, value: n }
}

/** 今日 (ローカル日付) の `YYYY-MM-DD` */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** 保存済みの値を入力欄の値にする (期首残が無ければ空) */
export function inputFromRow(row: OpeningRow): OpeningInput {
  const o = row.opening
  return o
    ? { carryover: formatDays(o.carryover), current: formatDays(o.current) }
    : { carryover: '', current: '' }
}

export function buildInputs(rows: OpeningRow[]): OpeningInputs {
  const out: OpeningInputs = {}
  for (const r of rows) out[r.employee_cd] = inputFromRow(r)
  return out
}

export interface RowIssue {
  employee_cd: string
  message: string
}

export interface SavePlan {
  /** 送る行 (変更した行だけ) */
  rows: OpeningPutRow[]
  /** 入力の誤り (あれば保存しない) */
  issues: RowIssue[]
  /** 期首日が正しくないときの文 */
  asOfError: string | null
  tooMany: boolean
}

/**
 * 保存する行を決める。変更した行だけを送る。
 * `restamp` が真なら、値が同じでも期首日が今の期首日と違う保存済みの行も送る (期首日を付け替える)。
 */
export function planSave(
  rows: OpeningRow[],
  inputs: OpeningInputs,
  asOf: string,
  restamp = false,
): SavePlan {
  const out: OpeningPutRow[] = []
  const issues: RowIssue[] = []
  for (const row of rows) {
    const input = inputs[row.employee_cd] ?? { carryover: '', current: '' }
    const c = parseDaysInput(input.carryover)
    const u = parseDaysInput(input.current)
    if (!c.ok || !u.ok) {
      issues.push({ employee_cd: row.employee_cd, message: DAYS_ERROR })
      continue
    }
    const saved = row.opening
    let dirty: boolean
    if (c.value === null && u.value === null) {
      dirty = saved !== null
    }
    else {
      dirty = saved === null
        || (c.value ?? 0) !== saved.carryover
        || (u.value ?? 0) !== saved.current
        || (restamp && saved.as_of !== asOf)
    }
    if (dirty) out.push({ employee_cd: row.employee_cd, carryover: c.value, current: u.value })
  }
  return {
    rows: out,
    issues,
    asOfError: isDate(asOf) ? null : '期首日を入れてください',
    tooMany: out.length > OPENING_MAX_ROWS,
  }
}

export interface PasteEntry {
  employee_cd: string
  carryover: string
  current: string
}

export interface PasteResult {
  /** 表に反映する行 (同じコードが複数あれば後の行) */
  entries: PasteEntry[]
  /** 一覧に居ないコード (無視した) */
  unknown: string[]
  /** 日数が読めなかった行 (元の文) */
  invalid: string[]
}

/** 貼り付けの 1 行を欄に分ける。タブがあればタブだけ (「12,5」を小数として残す)、無ければカンマか空白 */
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  const s = line.normalize('NFKC')
  return s.includes(',') ? s.split(',') : s.trim().split(/\s+/)
}

/**
 * Excel などから貼った「コード・繰越・今年度」の行を読む。
 * 見出し行 (先頭の、コードが一覧に無く日数が数でない行)・空行は黙って飛ばす。
 * コードだけの行は日数が無いので invalid (空欄で消す意味にはしない)。
 */
export function parsePaste(text: string, knownCodes: Iterable<string>): PasteResult {
  const known = new Set(knownCodes)
  const byCode = new Map<string, PasteEntry>()
  const unknown: string[] = []
  const invalid: string[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (raw.trim() === '') continue
    const parts = splitLine(raw)
    const cells = [...parts, '', '']
    const code = cells[0]!.normalize('NFKC').trim()
    const c = parseDaysInput(cells[1]!)
    const u = parseDaysInput(cells[2]!)
    if (!known.has(code)) {
      const header = byCode.size === 0 && unknown.length === 0 && (!c.ok || !u.ok)
      if (!header && !unknown.includes(code)) unknown.push(code)
      continue
    }
    if (parts.length < 2 || !c.ok || !u.ok) {
      invalid.push(raw.trim())
      continue
    }
    byCode.set(code, {
      employee_cd: code,
      carryover: c.value === null ? '' : formatDays(c.value),
      current: u.value === null ? '' : formatDays(u.value),
    })
  }
  return { entries: [...byCode.values()], unknown, invalid }
}

/** 貼り付けの結果を入力欄に反映した新しい入力 (元は変えない) */
export function applyPaste(inputs: OpeningInputs, entries: PasteEntry[]): OpeningInputs {
  const out: OpeningInputs = { ...inputs }
  for (const e of entries) out[e.employee_cd] = { carryover: e.carryover, current: e.current }
  return out
}

function asEmployee(r: OpeningRow): Employee {
  return {
    employee_code: r.employee_cd,
    employee_name: r.employee_name,
    dept_code: r.dept_code,
    hire_date: r.hire_date,
    retire_date: r.retire_date,
  }
}

/** 部門 (空なら全部) と、社員C・氏名の検索語で絞る。並びは employees.ts の searchEmployees と同じ */
export function filterOpeningRows(
  rows: OpeningRow[],
  filter: { dept: string, query: string },
): OpeningRow[] {
  const inDept = filter.dept === ''
    ? rows
    : rows.filter(r => String(r.dept_code ?? '') === filter.dept)
  const byCode = new Map(inDept.map(r => [r.employee_cd, r]))
  return searchEmployees(inDept.map(asEmployee), filter.query).map(e => byCode.get(e.employee_code)!)
}

export interface DeptOption {
  value: string
  label: string
}

/** 絞り込みの部門の選択肢 (一覧に居る部門だけ。名前が分かれば「コード 名前」) */
export function deptOptions(rows: OpeningRow[], departments: Department[]): DeptOption[] {
  const names = new Map(departments.map(d => [d.department_code, d.department_name]))
  const codes = new Set<string>()
  for (const r of rows) {
    const c = String(r.dept_code ?? '')
    if (c !== '') codes.add(c)
  }
  return [...codes]
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
    .map((c) => {
      const n = names.get(c)
      return { value: c, label: n ? `${c} ${n}` : c }
    })
}
