import { describe, expect, it } from 'vitest'
import { authScheme, looksLikeFile, planReply, propfindXml, summarizeRequest } from '../../server/utils/dav-probe'

describe('authScheme', () => {
  it('方式名だけを返し、資格情報は含めない', () => {
    expect(authScheme('Basic dXNlcjpwYXNz')).toBe('Basic')
    expect(authScheme('  Digest username="a"')).toBe('Digest')
  })
  it('無い・空なら null', () => {
    expect(authScheme(null)).toBeNull()
    expect(authScheme('   ')).toBeNull()
  })
})

describe('summarizeRequest', () => {
  it('許可したヘッダーだけ値を出し、Authorization の値は出さない', () => {
    const h = new Headers({
      'Authorization': 'Basic c2VjcmV0',
      'Content-Length': '123',
      'User-Agent': 'Canon',
      'Depth': '0',
      'X-Other': 'hidden',
    })
    const s = summarizeRequest('propfind', '/dav/ohishi/', h)
    expect(s.method).toBe('PROPFIND')
    expect(s.path).toBe('/dav/ohishi/')
    expect(s.authScheme).toBe('Basic')
    expect(s.headers).toEqual({ 'content-length': '123', 'user-agent': 'Canon', 'depth': '0' })
    expect(s.headerNames).toEqual(['authorization', 'content-length', 'depth', 'user-agent', 'x-other'])
    expect(JSON.stringify(s)).not.toContain('c2VjcmV0')
    expect(JSON.stringify(s)).not.toContain('hidden')
  })
  it('Authorization が無ければ authScheme は null', () => {
    expect(summarizeRequest('PUT', '/dav/a.pdf', new Headers()).authScheme).toBeNull()
  })
})

describe('looksLikeFile', () => {
  it('末尾に拡張子があればファイル', () => {
    expect(looksLikeFile('/dav/ohishi/scan_001.pdf')).toBe(true)
    expect(looksLikeFile('/dav/ohishi/')).toBe(false)
    expect(looksLikeFile('/dav/ohishi')).toBe(false)
    expect(looksLikeFile('')).toBe(false)
  })
})

describe('propfindXml', () => {
  it('フォルダとして返し、href をエスケープする', () => {
    const x = propfindXml('/dav/a&b<c>/')
    expect(x).toContain('<D:collection/>')
    expect(x).toContain('<D:href>/dav/a&amp;b&lt;c&gt;/</D:href>')
  })
})

describe('planReply', () => {
  it('OPTIONS は認証なしでも DAV を名乗る', () => {
    const r = planReply('options', '/dav/', false)
    expect(r.status).toBe(200)
    expect(r.headers.DAV).toBe('1')
  })
  it('認証が無ければ Basic で求める', () => {
    const r = planReply('PUT', '/dav/a.pdf', false)
    expect(r.status).toBe(401)
    expect(r.headers['WWW-Authenticate']).toContain('Basic')
  })
  it('PROPFIND はフォルダなら 207、ファイルなら 404', () => {
    const dir = planReply('PROPFIND', '/dav/ohishi/', true)
    expect(dir.status).toBe(207)
    expect(dir.body).toContain('/dav/ohishi/')
    expect(planReply('PROPFIND', '/dav/ohishi/a.pdf', true).status).toBe(404)
  })
  it('MKCOL・PUT は 201、DELETE は 204、GET・HEAD は 404', () => {
    expect(planReply('MKCOL', '/dav/x/', true).status).toBe(201)
    expect(planReply('PUT', '/dav/x/a.pdf', true).status).toBe(201)
    expect(planReply('DELETE', '/dav/x/a.pdf', true).status).toBe(204)
    expect(planReply('GET', '/dav/x/a.pdf', true).status).toBe(404)
    expect(planReply('HEAD', '/dav/x/a.pdf', true).status).toBe(404)
  })
  it('それ以外は 405 と Allow', () => {
    const r = planReply('LOCK', '/dav/x/a.pdf', true)
    expect(r.status).toBe(405)
    expect(r.headers.Allow).toContain('PUT')
  })
})
