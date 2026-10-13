/**
 * 複合機 (iR-ADV C5535 III) の WebDAV 送信を受ける /dav/** のロジック (Refs ohishi-exp/rust-leave-worker#1)。
 *
 * 実測した複合機の挙動: `PUT /dav/<フォルダ>/<日時>.pdf` だけを送る (PROPFIND/MKCOL なし)。
 * 認証なし 0 バイト → 401 (WWW-Authenticate: Basic を見て) → Basic 付き 0 バイト → Basic 付き本体。
 *
 * PDF を受けたら sha256 を計算し、auth-worker の RPC `issueTicket` に Authorization ごと渡して
 * チケットを貰い、R2 (leave-inbox) に customMetadata.ticket 付きで置く。会社の判定はしない
 * (チケットは auth-worker が作り、rust-leave-worker が auth-worker に検証させる)。
 * 会社は資格情報だけで決まるので、URL の受信アドレス (`/dav/<mailbox>/<file>` の mailbox) が
 * その会社のものかを rust-leave-worker の内部口 (service binding LEAVE_WORKER) で照合し、
 * 食い違えば put せず 403 を返す (誤送信を受け取り時に弾く)。
 *
 * 機械の入口は auth-worker の `/m/leave-scan/<rest>` 1 か所で、auth-worker が Basic を照合してから
 * Service Binding でここ (`/dav/<rest>`) へ中継する。中継は `X-Internal-Shared-Secret`
 * (= INTERNAL_SHARED_SECRET) を付けてくるので、一致しないものは 404 で存在を見せない。
 *
 * ログに Authorization・チケット・共有秘密・本文は出さない。
 */

/** PUT の本文の上限 (1 枚約 46KB。まとめて送っても十分な余裕) */
export const MAX_PUT_BYTES = 10 * 1024 * 1024

/** auth-worker の RPC に渡す用途 */
export const PURPOSE = 'leave-scan'

/** 元名の最大文字数 */
export const NAME_MAX = 100

const ALLOW = 'OPTIONS, PROPFIND, MKCOL, PUT, DELETE'
const WWW_AUTHENTICATE = 'Basic realm="leave-scan", charset="UTF-8"'

export interface DavReply {
  status: number
  headers: Record<string, string>
  body?: string
}

/** ログに出す結果の種類 */
export type DavKind =
  | 'not_relayed'
  | 'options'
  | 'unauthorized'
  | 'empty'
  | 'too_large'
  | 'rejected'
  | 'mailbox_missing'
  | 'mailbox_mismatch'
  | 'stored'
  | 'upstream_error'
  | 'propfind'
  | 'mkcol'
  | 'delete'
  | 'not_found'
  | 'method_not_allowed'

export interface DavOutcome {
  kind: DavKind
  reply: DavReply
  /** upstream_error のときの例外の message (RPC・R2 の失敗の切り分け用) */
  detail?: string
}

export interface IssuedTicket {
  ticket: string
  tenantId: string
  username: string
}

/** auth-worker の MachineCredentialEntrypoint (service binding AUTH_MCRED) */
export interface MachineCredentialRpc {
  issueTicket(authorization: string, purpose: string, sha256: string): Promise<IssuedTicket | null>
}

/** R2 bucket (binding LEAVE_INBOX) の使う分だけ */
export interface InboxBucket {
  put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string }, customMetadata: Record<string, string> },
  ): Promise<unknown>
}

/** rust-leave-worker への service binding (LEAVE_WORKER) の使う分だけ */
export interface LeaveFetcher {
  fetch(
    url: string,
    init: { method: string, headers: Record<string, string>, body: string },
  ): Promise<{ status: number }>
}

export interface DavDeps {
  mcred: MachineCredentialRpc
  inbox: InboxBucket
  uuid: () => string
  /** 受信アドレス照合の相手 (binding が無ければ null/undefined → 503) */
  leave: LeaveFetcher | null | undefined
  /** `X-Internal-Shared-Secret` に載せる INTERNAL_SHARED_SECRET */
  secret: string | null | undefined
}

/** 照合の内部口。URL の host は名目で、path はこれに固定する (利用者の path・header は中継しない)。 */
export const SCAN_CHECK_URL = 'https://leave-worker/internal/scan-check'

const unauthorized = (): DavOutcome => ({
  kind: 'unauthorized',
  reply: { status: 401, headers: { 'WWW-Authenticate': WWW_AUTHENTICATE } },
})

/** auth-worker からの中継でないときの応答 (存在を見せない) */
export const NOT_RELAYED: DavOutcome = { kind: 'not_relayed', reply: { status: 404, headers: {} } }

/**
 * `X-Internal-Shared-Secret` が INTERNAL_SHARED_SECRET と一致するか (auth-worker からの中継か)。
 * どちらかが無い・空なら偽。比較は定数時間 (長さの違いも全バイト見てから偽にする)。
 */
export function isRelayed(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!header || !secret) return false
  const enc = new TextEncoder()
  const a = enc.encode(header)
  const b = enc.encode(secret)
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) diff |= (a[i % a.length]! ^ b[i % b.length]!)
  return diff === 0
}

/** Authorization ヘッダーが付いているか (値の検証は auth-worker がする) */
export function hasAuthorization(header: string | null | undefined): header is string {
  return typeof header === 'string' && header.trim() !== ''
}

/** 末尾の要素に拡張子があればファイル、無ければフォルダとみなす。 */
export function looksLikeFile(path: string): boolean {
  const last = path.replace(/\/+$/, '').split('/').pop() ?? ''
  return /\.[A-Za-z0-9]+$/.test(last)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** フォルダ 1 つ分の PROPFIND 応答 (中身は空のフォルダとして返す)。 */
export function propfindXml(href: string): string {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<D:multistatus xmlns:D="DAV:"><D:response>'
    + `<D:href>${escapeXml(href)}</D:href>`
    + '<D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>'
    + '<D:status>HTTP/1.1 200 OK</D:status></D:propstat>'
    + '</D:response></D:multistatus>'
}

/**
 * PUT 以外のメソッドの応答。OPTIONS だけ認証なしで答え、それ以外 (認証なしの PUT も) は Authorization が無ければ 401。
 * (PUT は本文を読む必要があるので handlePut で扱う)
 */
export function planReply(method: string, path: string, hasAuth: boolean): DavOutcome {
  const m = method.toUpperCase()
  if (m === 'OPTIONS') {
    return { kind: 'options', reply: { status: 200, headers: { 'DAV': '1', 'Allow': ALLOW, 'MS-Author-Via': 'DAV' } } }
  }
  if (!hasAuth) return unauthorized()
  switch (m) {
    case 'PROPFIND':
      // 送る前の存在確認: ファイルは「無い」、フォルダは「ある」と答える
      if (looksLikeFile(path)) return { kind: 'not_found', reply: { status: 404, headers: {} } }
      return {
        kind: 'propfind',
        reply: { status: 207, headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: propfindXml(path) },
      }
    case 'MKCOL':
      return { kind: 'mkcol', reply: { status: 201, headers: {} } }
    case 'DELETE':
      return { kind: 'delete', reply: { status: 204, headers: {} } }
    case 'GET':
    case 'HEAD':
      return { kind: 'not_found', reply: { status: 404, headers: {} } }
    default:
      return { kind: 'method_not_allowed', reply: { status: 405, headers: { Allow: ALLOW } } }
  }
}

/**
 * パスの最後の要素を元名にする: decode し、`/` `\` 制御文字を除き、NAME_MAX 文字に切る。
 * 空になったら `scan.pdf`。
 */
export function originalName(path: string): string {
  const last = path.replace(/\/+$/, '').split('/').pop() ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(last)
  }
  catch {
    decoded = last
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = decoded.replace(/[/\\\u0000-\u001F\u007F]/g, '').trim()
  const name = Array.from(cleaned).slice(0, NAME_MAX).join('')
  return name === '' ? 'scan.pdf' : name
}

/**
 * `/dav/<mailbox>/<file>` の 1 要素目 (受信アドレス) を decode して返す。
 * 1 要素目が無い (`/dav/<file>` だけ)・decode が例外・空になるときは null。
 */
export function mailboxOf(path: string): string | null {
  const parts = path.split('/').filter(p => p !== '')
  const rest = parts[0] === 'dav' ? parts.slice(1) : parts
  if (rest.length < 2) return null
  try {
    return decodeURIComponent(rest[0]!) || null
  }
  catch {
    return null
  }
}

/** scan-check の応答 status を結果に写す: 204 一致 / 403 不一致 / それ以外 (400・401・5xx) は設定ミスなので error。 */
export function scanCheckResult(status: number): 'match' | 'mismatch' | 'error' {
  if (status === 204) return 'match'
  if (status === 403) return 'mismatch'
  return 'error'
}

/** inbox の key。同じ名前で何度送っても上書きされないよう UUID を前置し、拡張子は .pdf に揃える。 */
export function inboxKey(uuid: string, name: string): string {
  return /\.pdf$/i.test(name) ? `${uuid}-${name}` : `${uuid}-${name}.pdf`
}

/** sha256 の hex (小文字) */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 本文を上限付きで読む。Content-Length か実際の長さが limit を超えたら null (読むのをやめる)。
 * body が無ければ 0 バイト。
 */
export async function readBodyLimited(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  limit: number = MAX_PUT_BYTES,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (contentLength !== null && Number(contentLength) > limit) {
    await body?.cancel()
    return null
  }
  if (!body) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/**
 * PUT の処理。`body` は readBodyLimited の結果 (null = 上限超え)。
 * 0 バイト (複合機が最初に送る空ファイル) は保存せず 201、RPC も呼ばない。
 */
export async function handlePut(
  path: string,
  authorization: string | null | undefined,
  body: Uint8Array<ArrayBuffer> | null,
  deps: DavDeps,
): Promise<DavOutcome> {
  if (!hasAuthorization(authorization)) return unauthorized()
  if (body === null) return { kind: 'too_large', reply: { status: 413, headers: {} } }
  if (body.byteLength === 0) return { kind: 'empty', reply: { status: 201, headers: {} } }

  try {
    const sha256 = await sha256Hex(body)
    const issued = await deps.mcred.issueTicket(authorization, PURPOSE, sha256)
    if (!issued) return { ...unauthorized(), kind: 'rejected' }

    // 受信アドレスと会社の照合 (R2 に置く前)。401 は返さない (複合機が認証をやり直し続けるため)
    const mailbox = mailboxOf(path)
    if (mailbox === null) return { kind: 'mailbox_missing', reply: { status: 403, headers: {} } }
    if (!deps.leave || !deps.secret) throw new Error('LEAVE_WORKER binding or secret missing')
    const res = await deps.leave.fetch(SCAN_CHECK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-Shared-Secret': deps.secret },
      body: JSON.stringify({ mailbox, tenant_id: issued.tenantId }),
    })
    const check = scanCheckResult(res.status)
    if (check === 'mismatch') return { kind: 'mailbox_mismatch', reply: { status: 403, headers: {} } }
    if (check === 'error') throw new Error(`scan-check status ${res.status}`)

    await deps.inbox.put(inboxKey(deps.uuid(), originalName(path)), body, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { ticket: issued.ticket },
    })
    return { kind: 'stored', reply: { status: 201, headers: {} } }
  }
  catch (e) {
    return { kind: 'upstream_error', reply: { status: 503, headers: {} }, detail: e instanceof Error ? e.message : String(e) }
  }
}

/** ログ 1 行 (CF Observability は構造化引数を展開しないので文字列にする)。資格情報・本文は含めない。 */
export function logLine(method: string, path: string, bodyBytes: number, outcome: DavOutcome): string {
  return `dav: ${JSON.stringify({ method: method.toUpperCase(), path, bodyBytes, status: outcome.reply.status, kind: outcome.kind, detail: outcome.detail })}`
}
