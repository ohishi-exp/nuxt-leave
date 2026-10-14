import { describe, expect, it } from 'vitest'
import { checkPdfFile, MAX_UPLOAD_BYTES } from '~/utils/upload'

describe('checkPdfFile', () => {
  it('空は弾く', () => {
    expect(checkPdfFile({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toBe('空のファイルです')
  })

  it('10MiB ちょうどは通り、超えると弾く', () => {
    expect(checkPdfFile({ name: 'a.pdf', size: MAX_UPLOAD_BYTES, type: 'application/pdf' })).toBeNull()
    expect(checkPdfFile({ name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf' })).toBe('10MB を超えています')
  })

  it('type が PDF なら名前は問わない', () => {
    expect(checkPdfFile({ name: 'scan', size: 1, type: 'application/pdf' })).toBeNull()
  })

  it('type が空でも拡張子 .pdf (大小文字無視) なら通る', () => {
    expect(checkPdfFile({ name: 'SCAN.PDF', size: 1, type: '' })).toBeNull()
  })

  it('PDF でなければ弾く', () => {
    expect(checkPdfFile({ name: 'a.png', size: 1, type: 'image/png' })).toBe('PDF ではありません')
  })
})
