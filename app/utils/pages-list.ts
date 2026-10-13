/**
 * 一覧画面の表示 (タブ・日時・ページング) の共通部品。
 */
import type { PageStatus } from './leave-api'

export const STATUS_TABS: { value: PageStatus, label: string }[] = [
  { value: 'unlinked', label: '未紐づけ' },
  { value: 'linked', label: '紐づけ済み' },
  { value: 'ignored', label: '対象外' },
]

export function statusLabel(status: string): string {
  return STATUS_TABS.find(t => t.value === status)?.label ?? status
}

/** v がタブの値のどれかか (query の値の検査。状態タブも PDF タブも同じ形) */
export function isTabValue<T extends string>(tabs: { value: T }[], v: unknown): v is T {
  return tabs.some(t => t.value === v)
}

/** query の値をタブの値にする (読めなければ fallback) */
export function tabFromQuery<T extends string>(tabs: { value: T }[], v: unknown, fallback: T): T {
  return isTabValue(tabs, v) ? v : fallback
}

/** query の offset を件数にする (正の整数以外は 0) */
export function offsetFromQuery(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export function isPageStatus(v: unknown): v is PageStatus {
  return isTabValue(STATUS_TABS, v)
}

/** 受信日時を日本時間で `2026/10/10 14:05` の形にする (読めなければそのまま) */
export function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 返ってきた件数が limit と同じなら次のページがあるかもしれない */
export function hasNextPage(count: number, limit: number): boolean {
  return count >= limit
}
