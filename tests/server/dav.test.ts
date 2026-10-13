// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PUT_BYTES,
  NOT_RELAYED,
  handlePut,
  hasAuthorization,
  inboxKey,
  isRelayed,
  logLine,
  looksLikeFile,
  originalName,
  planReply,
  propfindXml,
  readBodyLimited,
  sha256Hex,
  type DavDeps,
} from '../../server/utils/dav'

const AUTH = 'Basic dXNlcjpwYXNz'

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(x)
      c.close()
    },
  })
}

function deps(issued: Awaited<ReturnType<DavDeps['mcred']['issueTicket']>> = { ticket: 'tk', tenantId: 't1', username: 'u1' }) {
  const issueTicket = vi.fn(async () => issued)
  const put = vi.fn(async () => ({}))
  const d: DavDeps = { mcred: { issueTicket }, inbox: { put }, uuid: () => 'uuid-1' }
  return { d, issueTicket, put }
}

describe('isRelayed', () => {
  it('共有秘密と一致するときだけ真', () => {
    expect(isRelayed('s3cret', 's3cret')).toBe(true)
    expect(isRelayed('s3cret', 's3creT')).toBe(false)
  })
  it('長さが違えば偽 (前方一致・繰り返しも通さない)', () => {
    expect(isRelayed('s3c', 's3cret')).toBe(false)
    expect(isRelayed('s3crets3cret', 's3cret')).toBe(false)
    expect(isRelayed('abab', 'ab')).toBe(false)
  })
  it('どちらかが無い・空なら偽', () => {
    expect(isRelayed(null, 's')).toBe(false)
    expect(isRelayed('', 's')).toBe(false)
    expect(isRelayed('s', null)).toBe(false)
    expect(isRelayed('s', undefined)).toBe(false)
    expect(isRelayed(undefined, '')).toBe(false)
  })
  it('中継でないときは 404 で存在を見せない', () => {
    expect(NOT_RELAYED).toEqual({ kind: 'not_relayed', reply: { status: 404, headers: {} } })
  })
})

describe('hasAuthorization', () => {
  it('空でない文字列だけ真', () => {
    expect(hasAuthorization(AUTH)).toBe(true)
    expect(hasAuthorization('  ')).toBe(false)
    expect(hasAuthorization(null)).toBe(false)
    expect(hasAuthorization(undefined)).toBe(false)
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
    expect(r.kind).toBe('options')
    expect(r.reply.status).toBe(200)
    expect(r.reply.headers.DAV).toBe('1')
    expect(r.reply.headers.Allow).toContain('PUT')
  })
  it('認証が無ければ (PUT も) Basic で求める', () => {
    for (const m of ['PUT', 'PROPFIND', 'MKCOL', 'DELETE', 'GET', 'LOCK']) {
      const r = planReply(m, '/dav/a.pdf', false)
      expect(r.kind).toBe('unauthorized')
      expect(r.reply.status).toBe(401)
      expect(r.reply.headers['WWW-Authenticate']).toBe('Basic realm="leave-scan", charset="UTF-8"')
    }
  })
  it('PROPFIND はフォルダなら 207、ファイルなら 404', () => {
    const dir = planReply('PROPFIND', '/dav/ohishi/', true)
    expect(dir.reply.status).toBe(207)
    expect(dir.kind).toBe('propfind')
    expect(dir.reply.body).toContain('/dav/ohishi/')
    expect(planReply('PROPFIND', '/dav/ohishi/a.pdf', true).reply.status).toBe(404)
  })
  it('MKCOL は 201、DELETE は 204、GET・HEAD は 404', () => {
    expect(planReply('MKCOL', '/dav/x/', true).reply.status).toBe(201)
    expect(planReply('DELETE', '/dav/x/a.pdf', true).reply.status).toBe(204)
    expect(planReply('GET', '/dav/x/a.pdf', true).reply.status).toBe(404)
    expect(planReply('HEAD', '/dav/x/a.pdf', true).reply.status).toBe(404)
  })
  it('それ以外は 405 と Allow', () => {
    const r = planReply('LOCK', '/dav/x/a.pdf', true)
    expect(r.kind).toBe('method_not_allowed')
    expect(r.reply.status).toBe(405)
    expect(r.reply.headers.Allow).toContain('PUT')
  })
})

describe('originalName', () => {
  it('最後の要素を decode する', () => {
    expect(originalName('/dav/ohishi/20261013%20101500.pdf')).toBe('20261013 101500.pdf')
    expect(originalName('/dav/ohishi/%E7%94%B3%E8%AB%8B.pdf')).toBe('申請.pdf')
  })
  it('`/` `\\` 制御文字を除く', () => {
    expect(originalName('/dav/ohishi/a%2Fb%5Cc%00%1F%7Fd.pdf')).toBe('abcd.pdf')
  })
  it('decode できなければそのまま使う', () => {
    expect(originalName('/dav/ohishi/bad%E0.pdf')).toBe('bad%E0.pdf')
  })
  it('100 文字に切る (サロゲートペアを割らない)', () => {
    const long = '𠮷'.repeat(150)
    const name = originalName(`/dav/${encodeURIComponent(long)}`)
    expect(Array.from(name)).toHaveLength(100)
    expect(name).toBe('𠮷'.repeat(100))
  })
  it('空なら scan.pdf', () => {
    expect(originalName('/dav/ohishi/%00')).toBe('scan.pdf')
    expect(originalName('')).toBe('scan.pdf')
  })
  it('末尾の / は無視する', () => {
    expect(originalName('/dav/ohishi/a.pdf/')).toBe('a.pdf')
  })
})

describe('inboxKey', () => {
  it('UUID を前置し、.pdf で終わらなければ足す', () => {
    expect(inboxKey('u', 'a.pdf')).toBe('u-a.pdf')
    expect(inboxKey('u', 'A.PDF')).toBe('u-A.PDF')
    expect(inboxKey('u', 'ohishi')).toBe('u-ohishi.pdf')
  })
})

describe('sha256Hex', () => {
  it('小文字の hex', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('readBodyLimited', () => {
  it('body が無ければ 0 バイト', async () => {
    expect((await readBodyLimited(null, null))?.byteLength).toBe(0)
  })
  it('chunk をつなぐ', async () => {
    const r = await readBodyLimited(streamOf(new Uint8Array([1, 2]), new Uint8Array([3])), '3')
    expect(Array.from(r!)).toEqual([1, 2, 3])
  })
  it('Content-Length が上限超えなら読まずに null', async () => {
    const s = streamOf(new Uint8Array([1]))
    expect(await readBodyLimited(s, String(MAX_PUT_BYTES + 1))).toBeNull()
    expect(await readBodyLimited(null, '11', 10)).toBeNull()
  })
  it('実際の長さが上限超えなら null', async () => {
    expect(await readBodyLimited(streamOf(new Uint8Array(6), new Uint8Array(6)), null, 10)).toBeNull()
  })
  it('ちょうど上限は通す', async () => {
    expect((await readBodyLimited(streamOf(new Uint8Array(10)), '10', 10))?.byteLength).toBe(10)
  })
})

describe('handlePut', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4 abc')

  it('Authorization が無ければ 401 で RPC を呼ばない', async () => {
    const { d, issueTicket } = deps()
    const r = await handlePut('/dav/ohishi/a.pdf', null, pdf, d)
    expect(r.kind).toBe('unauthorized')
    expect(r.reply.status).toBe(401)
    expect(r.reply.headers['WWW-Authenticate']).toContain('Basic')
    expect(issueTicket).not.toHaveBeenCalled()
  })
  it('上限超えは 413', async () => {
    const { d, issueTicket } = deps()
    const r = await handlePut('/dav/ohishi/a.pdf', AUTH, null, d)
    expect(r).toEqual({ kind: 'too_large', reply: { status: 413, headers: {} } })
    expect(issueTicket).not.toHaveBeenCalled()
  })
  it('0 バイトは保存せず 201、RPC も呼ばない', async () => {
    const { d, issueTicket, put } = deps()
    const r = await handlePut('/dav/ohishi/a.pdf', AUTH, new Uint8Array(0), d)
    expect(r).toEqual({ kind: 'empty', reply: { status: 201, headers: {} } })
    expect(issueTicket).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })
  it('チケットが出なければ 401 (+ WWW-Authenticate) で保存しない', async () => {
    const { d, put } = deps(null)
    const r = await handlePut('/dav/ohishi/a.pdf', AUTH, pdf, d)
    expect(r.kind).toBe('rejected')
    expect(r.reply.status).toBe(401)
    expect(r.reply.headers['WWW-Authenticate']).toContain('Basic')
    expect(put).not.toHaveBeenCalled()
  })
  it('チケットが出たら sha256 で RPC を呼び、inbox に置いて 201', async () => {
    const { d, issueTicket, put } = deps()
    const r = await handlePut('/dav/ohishi/20261013.pdf', AUTH, pdf, d)
    expect(r).toEqual({ kind: 'stored', reply: { status: 201, headers: {} } })
    expect(issueTicket).toHaveBeenCalledWith(AUTH, 'leave-scan', await sha256Hex(pdf))
    expect(put).toHaveBeenCalledWith('uuid-1-20261013.pdf', pdf, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { ticket: 'tk' },
    })
  })
  it('RPC か R2 が投げたら 503', async () => {
    const { d } = deps()
    d.inbox.put = async () => {
      throw new Error('r2 down')
    }
    const r = await handlePut('/dav/a.pdf', AUTH, pdf, d)
    expect(r).toEqual({ kind: 'upstream_error', reply: { status: 503, headers: {} }, detail: 'r2 down' })

    d.mcred.issueTicket = async () => {
      throw 'rpc down' // eslint-disable-line no-throw-literal
    }
    expect((await handlePut('/dav/a.pdf', AUTH, pdf, d)).detail).toBe('rpc down')
  })
})

describe('logLine', () => {
  it('method / path / bodyBytes / status / kind だけを 1 行で', () => {
    const line = logLine('put', '/dav/ohishi/a.pdf', 123, { kind: 'stored', reply: { status: 201, headers: {} } })
    expect(line).toBe('dav: {"method":"PUT","path":"/dav/ohishi/a.pdf","bodyBytes":123,"status":201,"kind":"stored"}')
  })
  it('upstream_error は detail も出す', () => {
    const line = logLine('PUT', '/dav/a.pdf', 1, { kind: 'upstream_error', reply: { status: 503, headers: {} }, detail: 'x' })
    expect(line).toContain('"detail":"x"')
  })
})
