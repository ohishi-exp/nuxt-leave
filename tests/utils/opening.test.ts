import { describe, it, expect } from 'vitest'
import {
  applyPaste,
  buildInputs,
  deptOptions,
  filterOpeningRows,
  inputFromRow,
  normalizeDaysText,
  OPENING_MAX_ROWS,
  parseDaysInput,
  parsePaste,
  planSave,
  todayIso,
} from '~/utils/opening'
import type { OpeningRow } from '~/utils/leave-api'

function row(cd: string, over: Partial<OpeningRow> = {}): OpeningRow {
  return {
    employee_cd: cd,
    employee_name: `氏名${cd}`,
    dept_code: '10',
    hire_date: '2015-04-01',
    retire_date: null,
    opening: null,
    ...over,
  }
}

const saved = (c: number, u: number, as_of = '2026-10-01') => ({ as_of, carryover: c, current: u })

describe('日数の読み取り', () => {
  it('全角・カンマ小数・空白をそろえる', () => {
    expect(normalizeDaysText(' １２,５ ')).toBe('12.5')
    expect(normalizeDaysText('１２．５')).toBe('12.5')
  })

  it('空は null、数は値、範囲外・桁超過は ng', () => {
    expect(parseDaysInput('')).toEqual({ ok: true, value: null })
    expect(parseDaysInput('　')).toEqual({ ok: true, value: null })
    expect(parseDaysInput('12,5')).toEqual({ ok: true, value: 12.5 })
    expect(parseDaysInput('０')).toEqual({ ok: true, value: 0 })
    expect(parseDaysInput('999.9')).toEqual({ ok: true, value: 999.9 })
    expect(parseDaysInput('1000')).toEqual({ ok: false })
    expect(parseDaysInput('1.25')).toEqual({ ok: false })
    expect(parseDaysInput('-1')).toEqual({ ok: false })
    expect(parseDaysInput('abc')).toEqual({ ok: false })
  })

  it('todayIso はローカル日付 (引数省略も動く)', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayIso(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('入力欄の初期値', () => {
  it('保存済みなら日数の表示、無ければ空', () => {
    expect(inputFromRow(row('1', { opening: saved(3, 12.5) }))).toEqual({ carryover: '3', current: '12.5' })
    expect(inputFromRow(row('1', { opening: saved(0, 0) }))).toEqual({ carryover: '0', current: '0' })
    expect(inputFromRow(row('2'))).toEqual({ carryover: '', current: '' })
    expect(buildInputs([row('1'), row('2', { opening: saved(1, 2) })])).toEqual({
      1: { carryover: '', current: '' },
      2: { carryover: '1', current: '2' },
    })
  })
})

describe('planSave (変更した行だけ送る)', () => {
  const rows = [row('1', { opening: saved(3, 10) }), row('2'), row('3', { opening: saved(0, 5) })]

  it('触っていなければ何も送らない', () => {
    const p = planSave(rows, buildInputs(rows), '2026-10-10')
    expect(p).toEqual({ rows: [], issues: [], asOfError: null, tooMany: false })
  })

  it('値を変えた行・新規・削除だけが入る', () => {
    const inputs = buildInputs(rows)
    inputs['1'] = { carryover: '４', current: '10' } // 変更
    inputs['2'] = { carryover: '', current: '2,5' } // 新規 (繰越は null)
    inputs['3'] = { carryover: '', current: '' } // 削除
    const p = planSave(rows, inputs, '2026-10-10')
    expect(p.rows).toEqual([
      { employee_cd: '1', carryover: 4, current: 10 },
      { employee_cd: '2', carryover: null, current: 2.5 },
      { employee_cd: '3', carryover: null, current: null },
    ])
  })

  it('空は 0 と同じ扱いで、保存済みと同じなら変更ではない', () => {
    const inputs = buildInputs(rows)
    inputs['3'] = { carryover: '', current: '5.0' }
    expect(planSave(rows, inputs, '2026-10-10').rows).toEqual([])
    inputs['3'] = { carryover: '', current: '5.5' }
    expect(planSave(rows, inputs, '2026-10-10').rows).toHaveLength(1)
    inputs['3'] = { carryover: '1', current: '5' }
    expect(planSave(rows, inputs, '2026-10-10').rows).toHaveLength(1)
    inputs['1'] = { carryover: '3', current: '' }
    expect(planSave(rows, inputs, '2026-10-10').rows.map(r => r.employee_cd)).toContain('1')
  })

  it('入力が無い行 (inputs に居ない) は空として扱う', () => {
    expect(planSave([row('9')], {}, '2026-10-10').rows).toEqual([])
    expect(planSave([row('9', { opening: saved(1, 1) })], {}, '2026-10-10').rows).toEqual([
      { employee_cd: '9', carryover: null, current: null },
    ])
  })

  it('日数が読めない行は issues に入り送らない', () => {
    const inputs = buildInputs(rows)
    inputs['2'] = { carryover: 'x', current: '' }
    inputs['1'] = { carryover: '3', current: '1.23' }
    const p = planSave(rows, inputs, '2026-10-10')
    expect(p.rows).toEqual([])
    expect(p.issues.map(i => i.employee_cd)).toEqual(['1', '2'])
    expect(p.issues[0]!.message).toBe('日数は 0〜999.9 (小数 1 桁) で入れてください')
  })

  it('restamp は値が同じでも期首日が違う保存済みの行を送る', () => {
    const inputs = buildInputs(rows)
    expect(planSave(rows, inputs, '2026-10-10', true).rows.map(r => r.employee_cd)).toEqual(['1', '3'])
    expect(planSave(rows, inputs, '2026-10-01', true).rows).toEqual([])
    // 両方空の未保存の行は restamp でも送らない
    expect(planSave([row('2')], buildInputs([row('2')]), '2026-10-10', true).rows).toEqual([])
  })

  it('期首日が日付でなければ asOfError', () => {
    expect(planSave(rows, buildInputs(rows), '').asOfError).toBe('期首日を入れてください')
    expect(planSave(rows, buildInputs(rows), '2026-02-30').asOfError).toBe('期首日を入れてください')
  })

  it('1000 行を超えれば tooMany', () => {
    const many = Array.from({ length: OPENING_MAX_ROWS + 1 }, (_, i) => row(String(i)))
    const inputs = Object.fromEntries(many.map(r => [r.employee_cd, { carryover: '1', current: '1' }]))
    expect(planSave(many, inputs, '2026-10-10').tooMany).toBe(true)
    expect(planSave(many.slice(0, OPENING_MAX_ROWS), inputs, '2026-10-10').tooMany).toBe(false)
  })
})

describe('parsePaste', () => {
  const known = ['1021', '1022', '1023', '007']

  it('タブ区切り (見出し行・空行・全角数字・12,5)', () => {
    const text = '﻿社員コード\t繰越\t今年度\r\n\r\n１０２１\t3\t12,5\r\n1022\t\t８\n'
    const r = parsePaste(text, known)
    expect(r.entries).toEqual([
      { employee_cd: '1021', carryover: '3', current: '12.5' },
      { employee_cd: '1022', carryover: '', current: '8' },
    ])
    expect(r.unknown).toEqual([])
    expect(r.invalid).toEqual([])
  })

  it('カンマ区切りと空白区切り', () => {
    const r = parsePaste('1021,3,12.5\n1022 4 5\n007，1，2', known)
    expect(r.entries.map(e => [e.employee_cd, e.carryover, e.current])).toEqual([
      ['1021', '3', '12.5'],
      ['1022', '4', '5'],
      ['007', '1', '2'],
    ])
  })

  it('2 列だけなら今年度は空、同じコードは後の行が勝つ', () => {
    const r = parsePaste('1021\t3\n1021\t5\t1', known)
    expect(r.entries).toEqual([{ employee_cd: '1021', carryover: '5', current: '1' }])
    expect(parsePaste('1021\t3', known).entries).toEqual([{ employee_cd: '1021', carryover: '3', current: '' }])
  })

  it('知らないコードは unknown (重複なし)、見出しは入らない', () => {
    const r = parsePaste('コード\t繰越\t今年度\n9999\t1\t1\n9999\t2\t2\n1021\t1\t1\n8888\t\t', known)
    expect(r.unknown).toEqual(['9999', '8888'])
    expect(r.entries).toHaveLength(1)
  })

  it('先頭が知らないコードで数の行なら見出しではなく unknown', () => {
    const r = parsePaste('9999\t1\t1', known)
    expect(r.unknown).toEqual(['9999'])
  })

  it('見出しは unknown の後 (2 行目以降) なら unknown 扱い', () => {
    const r = parsePaste('9999\t1\t1\n社員コード\t繰越\t今年度', known)
    expect(r.unknown).toEqual(['9999', '社員コード'])
  })

  it('一覧にあるコードで日数が読めない行は invalid (反映しない)', () => {
    const r = parsePaste('1021\tabc\t1\n1022\t1\t1.25\n1023\t2\t3', known)
    expect(r.invalid).toEqual(['1021\tabc\t1', '1022\t1\t1.25'])
    expect(r.entries).toEqual([{ employee_cd: '1023', carryover: '2', current: '3' }])
  })

  it('コードだけの行は invalid、知らないコードだけの行は unknown', () => {
    const r = parsePaste('1021\n9999', known)
    expect(r.invalid).toEqual(['1021'])
    expect(r.unknown).toEqual(['9999'])
    expect(r.entries).toEqual([])
  })

  it('空の貼り付け', () => {
    expect(parsePaste('', known)).toEqual({ entries: [], unknown: [], invalid: [] })
  })
})

describe('applyPaste', () => {
  it('反映した新しい入力を返し、元は変えない', () => {
    const before = { 1: { carryover: '', current: '' } }
    const after = applyPaste(before, [{ employee_cd: '1', carryover: '2', current: '3' }])
    expect(after).toEqual({ 1: { carryover: '2', current: '3' } })
    expect(before['1']).toEqual({ carryover: '', current: '' })
  })
})

describe('絞り込み', () => {
  const rows = [
    row('1030', { employee_name: '佐藤', dept_code: 20 }),
    row('1020', { employee_name: '鈴木', dept_code: '10' }),
    row('1010', { employee_name: '高橋', dept_code: '10', retire_date: '2026-03-31' }),
    row('1040', { employee_name: null, dept_code: null }),
  ]

  it('部門と検索語で絞る (在籍者が先、社員C 順)', () => {
    expect(filterOpeningRows(rows, { dept: '', query: '' }).map(r => r.employee_cd))
      .toEqual(['1020', '1030', '1040', '1010'])
    expect(filterOpeningRows(rows, { dept: '10', query: '' }).map(r => r.employee_cd)).toEqual(['1020', '1010'])
    expect(filterOpeningRows(rows, { dept: '20', query: '' }).map(r => r.employee_cd)).toEqual(['1030'])
    expect(filterOpeningRows(rows, { dept: '', query: '鈴' }).map(r => r.employee_cd)).toEqual(['1020'])
    expect(filterOpeningRows(rows, { dept: '10', query: '１０１' }).map(r => r.employee_cd)).toEqual(['1010'])
    expect(filterOpeningRows(rows, { dept: '99', query: '' })).toEqual([])
  })

  it('部門の選択肢は一覧に居る部門だけ、名前が分かれば付ける', () => {
    expect(deptOptions(rows, [
      { department_code: '10', department_name: '本社' },
      { department_code: '30', department_name: '使われない' },
    ])).toEqual([
      { value: '10', label: '10 本社' },
      { value: '20', label: '20' },
    ])
    expect(deptOptions([], [])).toEqual([])
  })
})
