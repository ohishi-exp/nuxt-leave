/**
 * スキャン送信用の資格情報 (複合機・PC が /dav/** に Basic で名乗る username / password) の
 * 型・呼び出し・表示用の変換 (Refs ohishi-exp/rust-leave-worker#1)。
 *
 * 管理 API は auth-worker にあり、画面から `{authWorkerUrl}/api/machine-credentials` を直接叩く
 * (Bearer は useLeaveApi と同じ JWT)。管理者 (role=admin) 以外は 403。
 * password は発行の応答で 1 回だけ返る (auth-worker は hash しか持たない)。
 * fetch の実体は引数で受ける (画面は $fetch、テストは偽物)。
 */
import type { Fetcher } from './leave-api'

export const PURPOSE = 'leave-scan'

/** 名前 (label) の最大長 (auth-worker の MACHINE_CRED_LABEL_MAX と同じ) */
export const LABEL_MAX = 64

/** 一覧の 1 行 (password も hash も返らない) */
export interface MachineCredential {
  username: string
  purpose: string
  label: string
  /** ISO 8601 */
  created_at: string
  revoked: boolean
}

/** 発行の応答。password はこの 1 回しか取れない */
export interface IssuedCredential {
  username: string
  password: string
}

/** 末尾の `/` を落とした auth-worker の基点 URL */
function base(authWorkerUrl: string): string {
  return `${authWorkerUrl.replace(/\/+$/, '')}/api/machine-credentials`
}

export function listUrl(authWorkerUrl: string): string {
  return base(authWorkerUrl)
}

export function revokeUrl(authWorkerUrl: string, username: string): string {
  return `${base(authWorkerUrl)}/${encodeURIComponent(username)}/revoke`
}

export function rotateUrl(authWorkerUrl: string, username: string): string {
  return `${base(authWorkerUrl)}/${encodeURIComponent(username)}/rotate`
}

/** 一覧の応答は配列か `{ credentials: [...] }` のどちらでも受ける */
export function toCredentialList(res: unknown): MachineCredential[] {
  const rows = Array.isArray(res)
    ? res
    : (res && typeof res === 'object' && Array.isArray((res as { credentials?: unknown }).credentials))
        ? (res as { credentials: unknown[] }).credentials
        : []
  return (rows as MachineCredential[]).filter(r => r && typeof r.username === 'string')
}

export function createMachineCredentialApi(fetcher: Fetcher, authWorkerUrl: string) {
  return {
    async list(): Promise<MachineCredential[]> {
      return toCredentialList(await fetcher<unknown>(listUrl(authWorkerUrl), { query: { purpose: PURPOSE } }))
    },
    issue(label: string): Promise<IssuedCredential> {
      return fetcher<IssuedCredential>(listUrl(authWorkerUrl), { method: 'POST', body: { purpose: PURPOSE, label: label.trim() } })
    },
    revoke(username: string): Promise<unknown> {
      return fetcher(revokeUrl(authWorkerUrl, username), { method: 'POST' })
    },
    /** username はそのまま password だけ新しくする (旧 password は即失効)。新しい password はこの応答だけ。
     * rotate 前に発行済みの inbox のチケット (TTL 7 日) は username が有効かだけを見るので rotate 後も通る (過去の PUT への印) */
    rotate(username: string): Promise<IssuedCredential> {
      return fetcher<IssuedCredential>(rotateUrl(authWorkerUrl, username), { method: 'POST' })
    },
  }
}

export type MachineCredentialApi = ReturnType<typeof createMachineCredentialApi>

/** 名前の問題を文にする (問題なしは null) */
export function labelError(raw: string): string | null {
  const v = raw.trim()
  if (v === '') return '名前を入れてください'
  if (v.length > LABEL_MAX) return `名前は ${LABEL_MAX} 文字以内にしてください`
  return null
}

/** 発行日を `YYYY-MM-DD` (日本時間) で出す。読めなければそのまま */
export function formatIssuedDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 有効なものを先に、それぞれ新しい順 */
export function sortCredentials(rows: MachineCredential[]): MachineCredential[] {
  return [...rows].sort((a, b) => {
    if (a.revoked !== b.revoked) return a.revoked ? 1 : -1
    return b.created_at.localeCompare(a.created_at)
  })
}

/** 複合機に入れる設定値 */
export interface DeviceSetup {
  protocol: string
  host: string
  folder: string
  username: string
  password: string
  curl: string
}

/** auth-worker の機械用の入口 (Basic を照合して nuxt-leave の /dav へ中継する) */
export const MACHINE_ENTRY = '/m/leave-scan'

/** 複合機のフォルダ。会社は資格情報だけで決まるので、残りのパスは何でもよい */
export const MACHINE_FOLDER = `${MACHINE_ENTRY}/scan`

/**
 * 発行直後に出す複合機の設定例と、PC から試す curl。
 * host は auth-worker (本番 https://auth.ippoan.org / staging https://auth-staging.ippoan.org)。
 */
export function deviceSetup(authWorkerUrl: string, cred: IssuedCredential): DeviceSetup {
  const host = authWorkerUrl.replace(/\/+$/, '')
  const folder = MACHINE_FOLDER
  return {
    protocol: 'WebDAV',
    host,
    folder,
    username: cred.username,
    password: cred.password,
    curl: `curl -T test.pdf -u ${cred.username}:${cred.password} ${host}${folder}/test.pdf`,
  }
}

/** 設定例を「項目名・値」の行にする (画面はこの順に並べ、値ごとにコピーできる) */
export function deviceSetupRows(d: DeviceSetup): [string, string][] {
  return [
    ['プロトコル', d.protocol],
    ['ホスト名', d.host],
    ['フォルダへのパス', d.folder],
    ['ユーザー名', d.username],
    ['パスワード', d.password],
  ]
}
