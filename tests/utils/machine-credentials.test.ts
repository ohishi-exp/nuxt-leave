import { describe, it, expect, vi } from 'vitest'
import type { Fetcher } from '~/utils/leave-api'
import {
  LABEL_MAX,
  MAILBOX_PLACEHOLDER,
  PURPOSE,
  createMachineCredentialApi,
  deviceSetup,
  deviceSetupRows,
  formatIssuedDate,
  labelError,
  listUrl,
  revokeUrl,
  sortCredentials,
  toCredentialList,
  type MachineCredential,
} from '~/utils/machine-credentials'

function fakeFetcher(result: unknown) {
  const calls: { url: string, options: unknown }[] = []
  const fetcher = vi.fn(async (url: string, options?: unknown) => {
    calls.push({ url, options })
    return result
  }) as unknown as Fetcher
  return { fetcher, calls }
}

const row = (o: Partial<MachineCredential>): MachineCredential => ({
  username: 'mc_0', purpose: 'leave-scan', label: 'l', created_at: '2026-10-01T00:00:00Z', revoked: false, ...o,
})

describe('URL', () => {
  it('末尾の / を落として組み立てる', () => {
    expect(listUrl('https://auth.ippoan.org/')).toBe('https://auth.ippoan.org/api/machine-credentials')
    expect(revokeUrl('https://auth.ippoan.org', 'mc_a/b')).toBe('https://auth.ippoan.org/api/machine-credentials/mc_a%2Fb/revoke')
  })
})

describe('toCredentialList', () => {
  it('配列も { credentials } も受け、username の無い行は落とす', () => {
    expect(toCredentialList([row({}), null, { label: 'x' }])).toEqual([row({})])
    expect(toCredentialList({ credentials: [row({ username: 'mc_1' })] })).toEqual([row({ username: 'mc_1' })])
  })
  it('読めない形は空', () => {
    expect(toCredentialList(null)).toEqual([])
    expect(toCredentialList({ data: [] })).toEqual([])
    expect(toCredentialList('x')).toEqual([])
  })
})

describe('createMachineCredentialApi', () => {
  const URL = 'https://auth-staging.ippoan.org'

  it('list は purpose=leave-scan で GET', async () => {
    const { fetcher, calls } = fakeFetcher([row({})])
    expect(await createMachineCredentialApi(fetcher, URL).list()).toEqual([row({})])
    expect(calls).toEqual([{ url: `${URL}/api/machine-credentials`, options: { query: { purpose: PURPOSE } } }])
  })
  it('issue は名前を trim して POST', async () => {
    const { fetcher, calls } = fakeFetcher({ username: 'mc_1', password: 'p' })
    expect(await createMachineCredentialApi(fetcher, URL).issue(' 本社の複合機 ')).toEqual({ username: 'mc_1', password: 'p' })
    expect(calls[0]).toEqual({
      url: `${URL}/api/machine-credentials`,
      options: { method: 'POST', body: { purpose: 'leave-scan', label: '本社の複合機' } },
    })
  })
  it('revoke は POST', async () => {
    const { fetcher, calls } = fakeFetcher({})
    await createMachineCredentialApi(fetcher, URL).revoke('mc_1')
    expect(calls[0]).toEqual({ url: `${URL}/api/machine-credentials/mc_1/revoke`, options: { method: 'POST' } })
  })
})

describe('labelError', () => {
  it('空・長すぎは文、それ以外は null', () => {
    expect(labelError('  ')).toBe('名前を入れてください')
    expect(labelError('a'.repeat(LABEL_MAX + 1))).toContain(`${LABEL_MAX}`)
    expect(labelError(` ${'a'.repeat(LABEL_MAX)} `)).toBeNull()
  })
})

describe('formatIssuedDate', () => {
  it('日本時間の日付', () => {
    expect(formatIssuedDate('2026-10-12T15:30:00Z')).toBe('2026-10-13')
    expect(formatIssuedDate('2026-10-12T14:59:59Z')).toBe('2026-10-12')
  })
  it('読めなければそのまま', () => {
    expect(formatIssuedDate('?')).toBe('?')
  })
})

describe('sortCredentials', () => {
  it('有効なものを先に、それぞれ新しい順。元の配列は変えない', () => {
    const a = row({ username: 'a', created_at: '2026-01-01', revoked: true })
    const b = row({ username: 'b', created_at: '2026-02-01' })
    const c = row({ username: 'c', created_at: '2026-03-01' })
    const d = row({ username: 'd', created_at: '2026-04-01', revoked: true })
    const input = [a, b, c, d]
    expect(sortCredentials(input).map(r => r.username)).toEqual(['c', 'b', 'd', 'a'])
    expect(input.map(r => r.username)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('deviceSetup', () => {
  const cred = { username: 'mc_1', password: 'pw-_x' }

  it('origin と mailbox から複合機の設定と curl を作る', () => {
    expect(deviceSetup('https://leave.ippoan.org/', ' ohishi ', cred)).toEqual({
      protocol: 'WebDAV',
      host: 'https://leave.ippoan.org',
      folder: '/dav/ohishi',
      username: 'mc_1',
      password: 'pw-_x',
      curl: 'curl -T test.pdf -u mc_1:pw-_x https://leave.ippoan.org/dav/ohishi/test.pdf', // gitleaks:allow (テスト用のダミー値)
    })
  })
  it('行にすると複合機の画面の順', () => {
    expect(deviceSetupRows(deviceSetup('https://leave.ippoan.org', 'ohishi', cred))).toEqual([
      ['プロトコル', 'WebDAV'],
      ['ホスト名', 'https://leave.ippoan.org'],
      ['フォルダへのパス', '/dav/ohishi'],
      ['ユーザー名', 'mc_1'],
      ['パスワード', 'pw-_x'],
    ])
  })
  it('mailbox が空なら仮置き', () => {
    expect(deviceSetup('https://leave-staging.ippoan.org', null, cred).folder).toBe(`/dav/${MAILBOX_PLACEHOLDER}`)
    expect(deviceSetup('https://x', ' ', cred).folder).toBe(`/dav/${MAILBOX_PLACEHOLDER}`)
    expect(deviceSetup('https://x', undefined, cred).folder).toBe(`/dav/${MAILBOX_PLACEHOLDER}`)
  })
})
