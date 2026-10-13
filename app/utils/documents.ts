/**
 * PDF 単位の一覧と、全ページ連続入力の画面で使う純粋な部品。
 */
import type { DocState, PageStatus } from './leave-api'

export const DOC_TABS: { value: DocState, label: string }[] = [
  { value: 'open', label: '未完了' },
  { value: 'done', label: '完了' },
  { value: 'all', label: 'すべて' },
]

/**
 * fromIndex より後で最初の未紐づけ行の位置。無ければ先頭から fromIndex の前までを探す。
 * 全部済んでいれば null (fromIndex の行そのものは探さない)。
 */
export function nextUnlinkedIndex(pages: { status: PageStatus }[], fromIndex: number): number | null {
  for (let i = fromIndex + 1; i < pages.length; i++) {
    if (pages[i]!.status === 'unlinked') return i
  }
  for (let i = 0; i < fromIndex && i < pages.length; i++) {
    if (pages[i]!.status === 'unlinked') return i
  }
  return null
}
