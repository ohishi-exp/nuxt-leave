import { describe, it, expect } from 'vitest'
import {
  candidateKey,
  defaultSearchRange,
  SEARCH_RANGE_ERROR,
  validateSearchRange,
  initialCheckedKeys,
  isRowDirty,
  kindLabel,
  periodLabel,
  PERIOD_KINDS,
  rowButtons,
  rowKeyAction,
  selectedPeriods,
  toPageUpdateBody,
  unmatchedSaved,
  validateLinkForm,
  type LinkForm,
} from '~/utils/leave-periods'
import type { IchibanCandidatePeriod, LeavePeriod } from '~/utils/leave-api'

const cand = (start: string, end: string, ids: string[], half: 'am' | 'pm' | null = null): IchibanCandidatePeriod => ({
  kind: 'yukyu',
  start_date: start,
  end_date: end,
  half,
  rows: ids.map(id => ({ row_id: id, day: start, item_name: '有休' })),
})
const saved: LeavePeriod = { kind: 'rousai', start_date: '2026-09-01', end_date: '2026-09-02', half: null }

describe('区分', () => {
  it('back の値と同じ 4 区分', () => {
    expect(PERIOD_KINDS.map(k => k.value)).toEqual(['yukyu', 'rousai', 'tokukyu', 'kekkin'])
  })

  it('kindLabel は知らない値をそのまま返す', () => {
    expect(kindLabel('tokukyu')).toBe('特別休暇')
    expect(kindLabel('x')).toBe('x')
  })
})

describe('一番星の候補', () => {
  it('candidateKey は row_id を並べる', () => {
    expect(candidateKey(cand('2026-10-01', '2026-10-02', ['a', 'b']))).toBe('a,b')
  })

  it('periodLabel: 区分・期間・半日', () => {
    expect(periodLabel(cand('2026-10-01', '2026-10-03', ['a']))).toBe('有休 2026-10-01〜2026-10-03')
    expect(periodLabel(cand('2026-10-01', '2026-10-01', ['a']))).toBe('有休 2026-10-01')
    expect(periodLabel(cand('2026-10-01', '2026-10-01', ['a'], 'am'))).toBe('有休 2026-10-01 (午前)')
    expect(periodLabel(cand('2026-10-01', '2026-10-01', ['a'], 'pm'))).toBe('有休 2026-10-01 (午後)')
  })

  it('initialCheckedKeys: 保存済みと同じ候補、無ければ候補 1 つだけチェック済み', () => {
    const one = [cand('2026-10-01', '2026-10-01', ['a'])]
    expect(initialCheckedKeys(one, [])).toEqual(['a'])
    expect(initialCheckedKeys(one, [saved])).toEqual([])
    expect(initialCheckedKeys([...one, cand('2026-10-02', '2026-10-02', ['b'])], [])).toEqual([])
    expect(initialCheckedKeys([], [])).toEqual([])
    const s1: LeavePeriod = { kind: 'yukyu', start_date: '2026-10-01', end_date: '2026-10-01', half: null }
    const two = [...one, cand('2026-10-02', '2026-10-02', ['b'])]
    expect(initialCheckedKeys(two, [s1])).toEqual(['a'])
    expect(initialCheckedKeys(one, [{ ...s1, half: 'am' }])).toEqual([])
    expect(initialCheckedKeys(one, [{ ...s1, kind: 'rousai' }])).toEqual([])
    expect(initialCheckedKeys(one, [{ ...s1, start_date: '2026-10-02' }])).toEqual([])
    expect(initialCheckedKeys(one, [{ ...s1, end_date: '2026-10-02' }])).toEqual([])
  })

  it('unmatchedSaved: 候補に対応の無い保存済みだけ', () => {
    const s1: LeavePeriod = { kind: 'yukyu', start_date: '2026-10-01', end_date: '2026-10-01', half: null }
    const one = [cand('2026-10-01', '2026-10-01', ['a'])]
    expect(unmatchedSaved(one, [s1, saved])).toEqual([saved])
    expect(unmatchedSaved([], [s1])).toEqual([s1])
    expect(unmatchedSaved(one, [])).toEqual([])
  })

  it('selectedPeriods: チェックした候補だけ。行 ID は重複なし', () => {
    const p1 = cand('2026-10-01', '2026-10-01', ['a', 'b'], 'pm')
    const p2 = cand('2026-10-02', '2026-10-03', ['b', 'c'])
    const p3 = cand('2026-10-09', '2026-10-09', ['z'])
    expect(selectedPeriods(['a,b', 'b,c'], [p1, p2, p3], [saved])).toEqual({
      periods: [
        { kind: 'yukyu', start_date: '2026-10-01', end_date: '2026-10-01', half: 'pm' },
        { kind: 'yukyu', start_date: '2026-10-02', end_date: '2026-10-03', half: null },
      ],
      ichiban_row_ids: ['a', 'b', 'c'],
    })
  })

  it('selectedPeriods: チェックが無ければ保存済みをそのまま (行 ID なし)', () => {
    expect(selectedPeriods([], [cand('2026-10-01', '2026-10-01', ['a'])], [saved]))
      .toEqual({ periods: [saved], ichiban_row_ids: [] })
  })
})

describe('validateLinkForm', () => {
  const form = (cd: string, periods: LeavePeriod[]): LinkForm => ({ employee_cd: cd, note: '', periods, ichiban_row_ids: [] })

  it('linked は乗務員と期間 1 つ以上が必須', () => {
    expect(validateLinkForm(form(' ', []), 'linked')).toEqual([
      '乗務員を選んでください',
      '一番星の候補を 1 つ以上選んでください。無ければ一番星に記録を足してください',
    ])
    expect(validateLinkForm(form('1021', [saved]), 'linked')).toEqual([])
  })

  it('対象外・未紐づけは空でよい', () => {
    expect(validateLinkForm(form('', []), 'ignored')).toEqual([])
    expect(validateLinkForm(form('', []), 'unlinked')).toEqual([])
  })
})

describe('rowKeyAction', () => {
  const base = { ctrlKey: false, metaKey: false, zone: 'candidates' as const, menuOpen: false, candidateCount: 3 }
  const act = (key: string, o: Partial<Omit<typeof base, 'zone'>> & { zone?: 'candidates' | 'employee' | 'other' } = {}) =>
    rowKeyAction({ ...base, key, ...o })

  it('備考などの他の欄・メニュー展開中は何もしない', () => {
    expect(act('Enter', { zone: 'other' })).toBeNull()
    expect(act('Enter', { zone: 'employee', menuOpen: true })).toBeNull()
  })

  it('候補一覧の中: Enter = 紐づける、Ctrl / ⌘ + Enter = 対象外', () => {
    expect(act('Enter')).toEqual({ type: 'link' })
    expect(act('Enter', { ctrlKey: true })).toEqual({ type: 'ignore' })
    expect(act('Enter', { metaKey: true })).toEqual({ type: 'ignore' })
  })

  it('乗務員の欄の Enter は送信せず候補へ (候補が無ければ何もしない)', () => {
    expect(act('Enter', { zone: 'employee' })).toEqual({ type: 'focusCandidates' })
    expect(act('Enter', { zone: 'employee', candidateCount: 0 })).toBeNull()
    expect(act('Enter', { zone: 'employee', ctrlKey: true })).toBeNull()
    expect(act('Enter', { zone: 'employee', metaKey: true })).toBeNull()
  })

  it('乗務員の欄では Enter 以外は効かない', () => {
    expect(act('ArrowDown', { zone: 'employee' })).toBeNull()
    expect(act('1', { zone: 'employee' })).toBeNull()
  })

  it('候補一覧: ↑↓ 移動・Space で付け外し', () => {
    expect(act('ArrowUp')).toEqual({ type: 'move', delta: -1 })
    expect(act('ArrowDown')).toEqual({ type: 'move', delta: 1 })
    expect(act(' ')).toEqual({ type: 'toggle-focused' })
  })

  it('候補一覧: 数字は 1〜候補数の範囲だけ', () => {
    expect(act('1')).toEqual({ type: 'toggle', index: 0 })
    expect(act('3')).toEqual({ type: 'toggle', index: 2 })
    expect(act('4')).toBeNull()
    expect(act('0')).toBeNull()
    expect(act('a')).toBeNull()
  })
})

describe('PUT body への変換', () => {
  it('社員C・備考は trim して空なら null。linked は行 ID を送る', () => {
    expect(toPageUpdateBody({ employee_cd: ' 1021 ', note: ' 重複 ', periods: [saved], ichiban_row_ids: ['a'] }, 'linked'))
      .toEqual({ employee_cd: '1021', status: 'linked', note: '重複', periods: [saved], ichiban_row_ids: ['a'] })
    expect(toPageUpdateBody({ employee_cd: '', note: '  ', periods: [], ichiban_row_ids: [] }, 'ignored'))
      .toEqual({ employee_cd: null, status: 'ignored', note: null, periods: [] })
  })

  it('unlinked / ignored は保存済みの期間があっても periods 空', () => {
    const f: LinkForm = { employee_cd: '1', note: '', periods: [saved], ichiban_row_ids: ['a'] }
    expect(toPageUpdateBody(f, 'unlinked').periods).toEqual([])
    expect(toPageUpdateBody(f, 'ignored').periods).toEqual([])
    expect(toPageUpdateBody(f, 'linked').periods).toEqual([saved])
  })

  it('行 ID が無い・linked 以外はキーを付けない', () => {
    const f: LinkForm = { employee_cd: '1', note: '', periods: [saved], ichiban_row_ids: [] }
    expect('ichiban_row_ids' in toPageUpdateBody(f, 'linked')).toBe(false)
    expect('ichiban_row_ids' in toPageUpdateBody({ ...f, ichiban_row_ids: ['a'] }, 'ignored')).toBe(false)
  })
})

describe('行の変更判定とボタン', () => {
  const base = { employee_cd: '1', note: '', checked: ['a', 'b'] }

  it('乗務員・備考・チェックのどれかが違えば dirty (チェックは順序を無視)', () => {
    expect(isRowDirty(base, { ...base })).toBe(false)
    expect(isRowDirty(base, { ...base, checked: ['b', 'a'] })).toBe(false)
    expect(isRowDirty(base, { ...base, employee_cd: '2' })).toBe(true)
    expect(isRowDirty(base, { ...base, note: 'x' })).toBe(true)
    expect(isRowDirty(base, { ...base, checked: ['a'] })).toBe(true)
    expect(isRowDirty(base, { ...base, checked: ['a', 'c'] })).toBe(true)
  })

  it('状態ごとのボタン', () => {
    expect(rowButtons('unlinked', false)).toEqual(['link', 'ignore'])
    expect(rowButtons('unlinked', true)).toEqual(['link', 'ignore'])
    expect(rowButtons('linked', true)).toEqual(['relink', 'unlink'])
    expect(rowButtons('ignored', true)).toEqual(['relink', 'unlink'])
    expect(rowButtons('linked', false)).toEqual(['unlink'])
    expect(rowButtons('ignored', false)).toEqual(['unlink'])
  })
})

describe('探す期間', () => {
  it('初期値は基準日の前後 7 日 (月またぎも)、読めない基準日は空', () => {
    expect(defaultSearchRange('2026-09-10')).toEqual({ from: '2026-09-03', to: '2026-09-17' })
    expect(defaultSearchRange('2026-10-02', 3)).toEqual({ from: '2026-09-29', to: '2026-10-05' })
    expect(defaultSearchRange('')).toEqual({ from: '', to: '' })
  })

  it('両端を含めて 92 日までは通る (1 日・91 日・92 日)', () => {
    expect(validateSearchRange('2026-09-01', '2026-09-01')).toBeNull()
    expect(validateSearchRange('2026-09-01', '2026-11-30')).toBeNull()
    expect(validateSearchRange('2026-09-01', '2026-12-01')).toBeNull()
  })

  it('93 日・逆順・空・存在しない日は弾く', () => {
    expect(validateSearchRange('2026-09-01', '2026-12-02')).toBe(SEARCH_RANGE_ERROR)
    expect(validateSearchRange('2026-09-02', '2026-09-01')).toBe(SEARCH_RANGE_ERROR)
    expect(validateSearchRange('', '2026-09-01')).toBe(SEARCH_RANGE_ERROR)
    expect(validateSearchRange('2026-09-01', '')).toBe(SEARCH_RANGE_ERROR)
    expect(validateSearchRange('2026-02-30', '2026-03-01')).toBe(SEARCH_RANGE_ERROR)
  })
})
