/**
 * 一覧画面の表示と、紐づけ画面で保存した後に進む「次の未紐づけページ」の決め方。
 */
import type { LeavePage, PageStatus } from './leave-api'

export const STATUS_TABS: { value: PageStatus, label: string }[] = [
  { value: 'unlinked', label: '未紐づけ' },
  { value: 'linked', label: '紐づけ済み' },
  { value: 'ignored', label: '対象外' },
]

export function statusLabel(status: string): string {
  return STATUS_TABS.find(t => t.value === status)?.label ?? status
}

export function isPageStatus(v: unknown): v is PageStatus {
  return STATUS_TABS.some(t => t.value === v)
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

/** 今のページ以外で最初の未紐づけページの id (無ければ null) */
export function nextUnlinkedId(pages: LeavePage[], currentId: string): string | null {
  return pages.find(p => p.id !== currentId && p.status === 'unlinked')?.id ?? null
}
