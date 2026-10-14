/**
 * 全員の有給の年度一覧 (`/ledger-year`) の基準日の操作。
 * 年度は 4 月始まり。年度の範囲と数字は back (`GET /api/leave/ledger`) が返す。
 */
import { isDate } from './grants'

/** 基準日を月/年単位でずらす。移動先の月に同じ日が無ければ月の末日に丸める (3/31 の 1 か月前 = 2/28 か 2/29) */
export function shiftAsOf(asOf: string, unit: 'month' | 'year', delta: number): string {
  const [y, m, d] = asOf.split('-').map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) + (unit === 'year' ? delta * 12 : delta)
  const ny = Math.floor(total / 12)
  const nm = total % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** URL の `?as_of=` から基準日を決める (実在する `YYYY-MM-DD` ならそれ、違えば today) */
export function asOfFromQuery(v: unknown, today: string): string {
  return typeof v === 'string' && isDate(v) ? v : today
}

/** 「2026 年度 (2026-04-01〜2027-03-31)」 */
export function fiscalYearLabel(fy: { start: string, end: string, label: string }): string {
  return `${fy.label} (${fy.start}〜${fy.end})`
}
