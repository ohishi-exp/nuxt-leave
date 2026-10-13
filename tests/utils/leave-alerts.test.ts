import { describe, expect, it } from 'vitest'
import { directionLabel, formatAlertDay, groupAlerts } from '~/utils/leave-alerts'
import type { LeaveAlert } from '~/utils/leave-api'

const a = (employee_cd: string, day: string, kind: string, direction: LeaveAlert['direction'] = 'pdf_only'): LeaveAlert =>
  ({ employee_cd, day, kind, direction, first_seen_at: '', notified_at: null })

describe('leave-alerts', () => {
  it('方向の言葉', () => {
    expect(directionLabel('ichiban_only')).toBe('申請書なし')
    expect(directionLabel('pdf_only')).toBe('一番星に入力なし')
    expect(directionLabel('x')).toBe('x')
  })

  it('日付の整形', () => {
    expect(formatAlertDay('2026-10-13')).toBe('10/13 (火)')
    expect(formatAlertDay('bad')).toBe('bad')
  })

  it('乗務員ごとにまとめ、並べる', () => {
    const g = groupAlerts(
      [a('10', '2026-10-02', 'yukyu'), a('2', '2026-10-05', 'rousai', 'ichiban_only'), a('10', '2026-10-01', 'yukyu'), a('10', '2026-10-01', 'kekkin')],
      [{ employee_code: '2', employee_name: ' 山田 ' }, { employee_code: '10', employee_name: null }],
    )
    expect(g.map(x => x.label)).toEqual(['2 山田', '10'])
    expect(g[1]!.rows.map(r => r.day)).toEqual(['2026-10-01', '2026-10-01', '2026-10-02'])
    expect(g[0]!.rows[0]).toMatchObject({ dayLabel: '10/05 (月)', directionLabel: '申請書なし' })
  })

  it('従業員が引けなければコードだけ・空なら空', () => {
    expect(groupAlerts([a('9', '2026-10-01', 'yukyu')], [])[0]!.label).toBe('9')
    expect(groupAlerts([], [])).toEqual([])
  })
})
