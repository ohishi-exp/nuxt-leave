/**
 * 複合機 (iR-ADV C5535 III) の WebDAV 送信を受ける試験用の受け口のロジック (Refs ohishi-exp/rust-leave-worker#1)。
 *
 * 目的は実機の挙動の実測だけ: HTTPS で来るか / PUT の前に PROPFIND・MKCOL を送るか / 認証方式。
 * 受け取った本文は保存せず、ログにも本文と資格情報は出さない (認証は方式名だけ)。
 * 実測が済んだら rust-leave-worker の取り込み (Service Binding) に置き換える。
 */

/** ログに値まで出してよいヘッダー。それ以外は名前だけ出す。 */
const LOGGED_HEADER_VALUES = [
  'content-length',
  'content-type',
  'user-agent',
  'depth',
  'overwrite',
  'translate',
  'transfer-encoding',
  'expect',
] as const

export interface DavProbeSummary {
  method: string
  path: string
  /** Authorization の方式名 (Basic / Digest など)。資格情報は含めない。無ければ null。 */
  authScheme: string | null
  /** LOGGED_HEADER_VALUES に挙げたヘッダーの値 */
  headers: Record<string, string>
  /** 届いたヘッダー名の一覧 (値は出さない) */
  headerNames: string[]
}

export interface DavReply {
  status: number
  headers: Record<string, string>
  body?: string
}

const ALLOW = 'OPTIONS, PROPFIND, MKCOL, PUT, DELETE'

/** Authorization ヘッダーから方式名だけを取り出す。 */
export function authScheme(header: string | null): string | null {
  const scheme = header?.trim().split(/\s+/)[0]
  return scheme ? scheme : null
}

export function summarizeRequest(method: string, path: string, headers: Headers): DavProbeSummary {
  const picked: Record<string, string> = {}
  for (const name of LOGGED_HEADER_VALUES) {
    const v = headers.get(name)
    if (v !== null) picked[name] = v
  }
  return {
    method: method.toUpperCase(),
    path,
    authScheme: authScheme(headers.get('authorization')),
    headers: picked,
    // Workers は小文字で返すが、実装によっては元の大小を保つので揃える
    headerNames: [...headers.keys()].map(k => k.toLowerCase()).sort(),
  }
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
 * メソッドごとの応答。認証は方式を確かめたいだけなので、Authorization が付いていれば値は見ずに通す
 * (本文を保存しないので、誰が送っても何も残らない)。付いていなければ Basic で求める。
 */
export function planReply(method: string, path: string, hasAuth: boolean): DavReply {
  const m = method.toUpperCase()
  if (m === 'OPTIONS') {
    return { status: 200, headers: { 'DAV': '1', 'Allow': ALLOW, 'MS-Author-Via': 'DAV' } }
  }
  if (!hasAuth) {
    return { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="leave-scan", charset="UTF-8"' } }
  }
  switch (m) {
    case 'PROPFIND':
      // 送る前の存在確認: ファイルは「無い」、フォルダは「ある」と答える
      if (looksLikeFile(path)) return { status: 404, headers: {} }
      return {
        status: 207,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: propfindXml(path),
      }
    case 'MKCOL':
    case 'PUT':
      return { status: 201, headers: {} }
    case 'DELETE':
      return { status: 204, headers: {} }
    case 'GET':
    case 'HEAD':
      return { status: 404, headers: {} }
    default:
      return { status: 405, headers: { Allow: ALLOW } }
  }
}
