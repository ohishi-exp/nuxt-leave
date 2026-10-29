/**
 * 「漏れ」(一番星と申請書の食い違い) 画面の表示用の変換。
 * 方向の言葉は back (rust-leave-worker reconcile.rs:320-322) の通知の文面と同じものを TS 側に写している。
 */
import type { AlertDirection, Employee, LeaveAlert, NotifyAlertsResult } from './leave-api'
import { kindLabel } from './leave-periods'
import { WEEKDAYS } from './calendar'
import { employeeLabelByCode } from './employees'

export const DIRECTION_LABELS: Record<AlertDirection, string> = {
  ichiban_only: '申請書なし',
  pdf_only: '一番星に入力なし',
}

export function directionLabel(d: string): string {
  return DIRECTION_LABELS[d as AlertDirection] ?? d
}

/** `YYYY-MM-DD` → `MM/DD (曜)`。形が違えばそのまま返す */
export function formatAlertDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return day
  const w = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${m[2]}/${m[3]} (${WEEKDAYS[w]})`
}

export interface AlertRow {
  day: string
  dayLabel: string
  kindLabel: string
  directionLabel: string
}

export interface AlertGroup {
  employee_cd: string
  label: string
  rows: AlertRow[]
}

/** 乗務員ごとにまとめる。乗務員は社員C 順、各々は日付・区分順。名前が引けなければコードだけ */
export function groupAlerts(alerts: LeaveAlert[], employees: Employee[]): AlertGroup[] {
  const by = new Map<string, LeaveAlert[]>()
  for (const a of alerts) {
    const list = by.get(a.employee_cd) ?? []
    list.push(a)
    by.set(a.employee_cd, list)
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ja', { numeric: true }))
    .map(([cd, list]) => {
      return {
        employee_cd: cd,
        label: employeeLabelByCode(employees, cd),
        rows: [...list]
          .sort((x, y) => x.day.localeCompare(y.day) || x.kind.localeCompare(y.kind))
          .map(a => ({
            day: a.day,
            dayLabel: formatAlertDay(a.day),
            kindLabel: kindLabel(a.kind),
            directionLabel: directionLabel(a.direction),
          })),
      }
    })
}

/** 漏れを今すぐ送った結果の 1 文 */
export function notifyAlertsMessage(r: NotifyAlertsResult): string {
  if (r.sent_messages === 0) return '送る漏れはありません'
  return `${r.sent_messages} 通送りました (漏れ ${r.notified} 件)`
}
