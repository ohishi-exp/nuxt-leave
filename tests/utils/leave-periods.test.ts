import { describe, it, expect } from 'vitest'
import {
  canSelectHalf,
  HALF_OPTIONS,
  kindLabel,
  linkFormFromPage,
  newPeriodRow,
  normalizePeriodRow,
  PERIOD_KINDS,
  periodRowError,
  toPageUpdateBody,
  toPeriodBody,
  validateLinkForm,
  type LinkForm,
  type PeriodRow,
} from '~/utils/leave-periods'

const row = (start: string, end: string, half: PeriodRow['half'] = '', kind: PeriodRow['kind'] = 'yukyu'): PeriodRow =>
  ({ kind, start_date: start, end_date: end, half })

describe('区分・半日の選択肢', () => {
  it('back の値と同じ 4 区分', () => {
    expect(PERIOD_KINDS.map(k => k.value)).toEqual(['yukyu', 'rousai', 'tokukyu', 'kekkin'])
    expect(HALF_OPTIONS.map(h => h.value)).toEqual(['', 'am', 'pm'])
  })

  it('kindLabel は知らない値をそのまま返す', () => {
    expect(kindLabel('tokukyu')).toBe('特別休暇')
    expect(kindLabel('x')).toBe('x')
  })

  it('新しい行は有休・空', () => {
    expect(newPeriodRow()).toEqual(row('', ''))
  })
})

describe('半日', () => {
  it('開始日 = 終了日のときだけ選べる', () => {
    expect(canSelectHalf(row('2026-10-01', '2026-10-01'))).toBe(true)
    expect(canSelectHalf(row('2026-10-01', '2026-10-02'))).toBe(false)
    expect(canSelectHalf(row('', ''))).toBe(false)
  })

  it('normalize: 終了日が空なら開始日を入れる', () => {
    expect(normalizePeriodRow(row('2026-10-01', '', 'am'))).toEqual(row('2026-10-01', '2026-10-01', 'am'))
  })

  it('normalize: 複数日になったら半日を外す', () => {
    expect(normalizePeriodRow(row('2026-10-01', '2026-10-03', 'pm'))).toEqual(row('2026-10-01', '2026-10-03', ''))
  })
})

describe('periodRowError', () => {
  it('空', () => {
    expect(periodRowError(row('', '2026-10-01'))).toBe('開始日と終了日を入れてください')
    expect(periodRowError(row('2026-10-01', ''))).toBe('開始日と終了日を入れてください')
  })

  it('逆順', () => {
    expect(periodRowError(row('2026-10-03', '2026-10-01'))).toBe('終了日が開始日より前です')
  })

  it('半日の複数日', () => {
    expect(periodRowError(row('2026-10-01', '2026-10-02', 'am'))).toBe('半日は開始日と終了日が同じ日のときだけ選べます')
  })

  it('問題なし', () => {
    expect(periodRowError(row('2026-10-01', '2026-10-01', 'pm'))).toBeNull()
    expect(periodRowError(row('2026-10-01', '2026-10-05'))).toBeNull()
  })
})

describe('validateLinkForm', () => {
  const form = (cd: string, periods: PeriodRow[]): LinkForm => ({ employee_cd: cd, note: '', periods })

  it('linked は乗務員と期間 1 行以上が必須', () => {
    expect(validateLinkForm(form(' ', []), 'linked')).toEqual([
      '乗務員を選んでください',
      '期間を 1 行以上入れてください',
    ])
    expect(validateLinkForm(form('1021', [row('2026-10-01', '2026-10-01')]), 'linked')).toEqual([])
  })

  it('対象外・未紐づけは空でよい', () => {
    expect(validateLinkForm(form('', []), 'ignored')).toEqual([])
    expect(validateLinkForm(form('', []), 'unlinked')).toEqual([])
  })

  it('行ごとの問題に行番号を付ける', () => {
    expect(validateLinkForm(form('1021', [row('2026-10-01', '2026-10-01'), row('2026-10-05', '2026-10-01')]), 'linked'))
      .toEqual(['期間 2 行目: 終了日が開始日より前です'])
  })
})

describe('PUT body への変換', () => {
  it('半日の空は null', () => {
    expect(toPeriodBody(row('2026-10-01', '2026-10-01'))).toEqual({
      kind: 'yukyu', start_date: '2026-10-01', end_date: '2026-10-01', half: null,
    })
    expect(toPeriodBody(row('2026-10-01', '2026-10-01', 'am', 'rousai')).half).toBe('am')
  })

  it('社員C・備考は trim して空なら null', () => {
    expect(toPageUpdateBody({ employee_cd: ' 1021 ', note: ' 重複 ', periods: [row('2026-10-01', '2026-10-02', '', 'kekkin')] }, 'linked'))
      .toEqual({
        employee_cd: '1021',
        status: 'linked',
        note: '重複',
        periods: [{ kind: 'kekkin', start_date: '2026-10-01', end_date: '2026-10-02', half: null }],
      })
    expect(toPageUpdateBody({ employee_cd: '', note: '  ', periods: [] }, 'ignored'))
      .toEqual({ employee_cd: null, status: 'ignored', note: null, periods: [] })
  })

  it('取得したページをフォームにする', () => {
    expect(linkFormFromPage({
      employee_cd: null,
      note: null,
      periods: [{ kind: 'tokukyu', start_date: '2026-10-01', end_date: '2026-10-01', half: 'pm' },
        { kind: 'yukyu', start_date: '2026-10-02', end_date: '2026-10-03', half: null }],
    })).toEqual({
      employee_cd: '',
      note: '',
      periods: [row('2026-10-01', '2026-10-01', 'pm', 'tokukyu'), row('2026-10-02', '2026-10-03')],
    })
    expect(linkFormFromPage({ employee_cd: '1', note: 'n', periods: [] }))
      .toEqual({ employee_cd: '1', note: 'n', periods: [] })
  })
})
