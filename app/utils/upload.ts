/** back の `POST /api/leave/uploads` が受ける上限 (10MiB) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** 選んだファイルを送る前の検査。送ってよければ null、だめなら画面に出す 1 文 */
export function checkPdfFile(f: { name: string, size: number, type: string }): string | null {
  if (f.size === 0) return '空のファイルです'
  if (f.size > MAX_UPLOAD_BYTES) return '10MB を超えています'
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return 'PDF ではありません'
  return null
}
