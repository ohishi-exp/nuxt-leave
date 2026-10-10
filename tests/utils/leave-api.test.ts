import { describe, it, expect, vi } from 'vitest'
import {
  API_BASE,
  createLeaveApi,
  errorMessage,
  errorStatus,
  FORBIDDEN_MESSAGE,
  isForbidden,
  listPagesQuery,
  PAGE_LIMIT,
  pagePdfUrl,
  pageUrl,
  botConfigUrl,
  type Fetcher,
} from '~/utils/leave-api'

function fakeFetcher(result: unknown) {
  const calls: { url: string, options: unknown }[] = []
  const fetcher = vi.fn(async (url: string, options?: unknown) => {
    calls.push({ url, options })
    return result
  }) as unknown as Fetcher
  return { fetcher, calls }
}

describe('URL の組み立て', () => {
  it('base は /api/proxy/api', () => {
    expect(API_BASE).toBe('/api/proxy/api')
  })

  it('page / pdf / bot の URL は id を encode する', () => {
    expect(pageUrl('a b')).toBe('/api/proxy/api/leave/pages/a%20b')
    expect(pagePdfUrl('x')).toBe('/api/proxy/api/leave/pages/x/pdf')
    expect(botConfigUrl('b/1')).toBe('/api/proxy/api/admin/bot/configs/b%2F1')
  })

  it('一覧の query は limit 50・offset 0 が既定', () => {
    expect(listPagesQuery({ status: 'unlinked' })).toEqual({ status: 'unlinked', limit: PAGE_LIMIT, offset: 0 })
    expect(listPagesQuery({ status: 'linked', limit: 10, offset: 20 })).toEqual({ status: 'linked', limit: 10, offset: 20 })
  })
})

describe('createLeaveApi', () => {
  it('listPages は data を返し query を渡す', async () => {
    const { fetcher, calls } = fakeFetcher({ data: [{ id: '1' }] })
    const r = await createLeaveApi(fetcher).listPages({ status: 'ignored', offset: 50 })
    expect(r).toEqual([{ id: '1' }])
    expect(calls[0]).toEqual({
      url: '/api/proxy/api/leave/pages',
      options: { query: { status: 'ignored', limit: 50, offset: 50 } },
    })
  })

  it('getPage / updatePage / getPagePdf', async () => {
    const { fetcher, calls } = fakeFetcher({})
    const api = createLeaveApi(fetcher)
    await api.getPage('p1')
    const body = { employee_cd: '1021', status: 'linked' as const, note: null, periods: [] }
    await api.updatePage('p1', body)
    await api.getPagePdf('p1')
    expect(calls).toEqual([
      { url: '/api/proxy/api/leave/pages/p1', options: undefined },
      { url: '/api/proxy/api/leave/pages/p1', options: { method: 'PUT', body } },
      { url: '/api/proxy/api/leave/pages/p1/pdf', options: { responseType: 'arrayBuffer' } },
    ])
  })

  it('employees / departments は data を剥がす', async () => {
    const { fetcher, calls } = fakeFetcher({ source_table: 'x', data: [{ a: 1 }] })
    const api = createLeaveApi(fetcher)
    expect(await api.listEmployees()).toEqual([{ a: 1 }])
    expect(await api.listDepartments()).toEqual([{ a: 1 }])
    expect(calls.map(c => c.url)).toEqual([
      '/api/proxy/api/leave/employees',
      '/api/proxy/api/leave/departments',
    ])
  })

  it('testNotify は body 無しの POST', async () => {
    const { fetcher, calls } = fakeFetcher({})
    await createLeaveApi(fetcher).testNotify()
    expect(calls[0]).toEqual({ url: '/api/proxy/api/leave/settings/test-notify', options: { method: 'POST' } })
  })

  it('settings の GET / PUT', async () => {
    const { fetcher, calls } = fakeFetcher({ mailbox: 'abc' })
    const api = createLeaveApi(fetcher)
    expect(await api.getSettings()).toEqual({ mailbox: 'abc' })
    const body = { mailbox: 'abc', allowed_senders: [], dept_codes: [], lineworks_channel_id: null, notify_recipient_id: null, notify_bot_config_id: null, grace_days: 7, enabled: true }
    await api.putSettings(body)
    expect(calls[1]).toEqual({ url: '/api/proxy/api/leave/settings', options: { method: 'PUT', body } })
  })

  it('bot configs と channels', async () => {
    const { fetcher, calls } = fakeFetcher({ configs: [{ id: 'b' }] })
    const api = createLeaveApi(fetcher)
    expect(await api.listBotConfigs()).toEqual([{ id: 'b' }])
    const body = { name: 'n', client_id: 'c', service_account: 's', bot_id: 'b' }
    await api.saveBotConfig(body)
    await api.deleteBotConfig('b1')
    await api.listChannels()
    await api.listRecipients()
    expect(calls.slice(1)).toEqual([
      { url: '/api/proxy/api/admin/bot/configs', options: { method: 'POST', body } },
      { url: '/api/proxy/api/admin/bot/configs/b1', options: { method: 'DELETE' } },
      { url: '/api/proxy/api/notify/lineworks/channels', options: undefined },
      { url: '/api/proxy/api/notify/recipients', options: undefined },
    ])
  })
})

describe('エラーの文', () => {
  it('errorStatus は status か statusCode', () => {
    expect(errorStatus({ status: 400 })).toBe(400)
    expect(errorStatus({ statusCode: 502 })).toBe(502)
    expect(errorStatus({})).toBeUndefined()
    expect(errorStatus(null)).toBeUndefined()
    expect(errorStatus('x')).toBeUndefined()
  })

  it('403 は管理者だけの文', () => {
    expect(isForbidden({ status: 403 })).toBe(true)
    expect(isForbidden({ status: 400 })).toBe(false)
    expect(errorMessage({ statusCode: 403, data: { error: 'forbidden' } })).toBe(FORBIDDEN_MESSAGE)
  })

  it('既知の語は日本語、知らない語はそのまま', () => {
    expect(errorMessage({ status: 400, data: { error: 'half_day_must_be_single_day' } }))
      .toBe('半日は開始日と終了日が同じ日のときだけ選べます')
    expect(errorMessage({ status: 409, data: { error: 'mailbox_taken' } }))
      .toBe('この受信アドレスは他の会社が使っています')
    expect(errorMessage({ status: 400, data: { error: 'unknown_notify_recipient' } })).toBe('選んだ個人が見つかりません')
    expect(errorMessage({ status: 400, data: { error: 'unknown_notify_bot' } })).toBe('選んだ bot が使えません')
    expect(errorMessage({ status: 400, data: { error: 'notify_bot_without_recipient' } })).toBe('bot は個人を選んだときだけ指定できます')
    expect(errorMessage({ status: 400, data: { error: 'both_notify_targets' } })).toBe('通知先は 1 つだけ選んでください')
    expect(errorMessage({ status: 404, data: { error: 'no_notify_target' } })).toBe('通知先が保存されていません')
    expect(errorMessage({ status: 502, data: { error: 'notify_failed' } })).toBe('送信に失敗しました')
    expect(errorMessage({ status: 503, data: { error: 'notify_unavailable' } })).toBe('この環境では送れません')
    expect(errorMessage({ status: 400, data: { error: 'something_new' } })).toBe('something_new')
  })

  it('data.message → message → 既定の文の順', () => {
    expect(errorMessage({ data: { message: 'm1' }, message: 'm2' })).toBe('m1')
    expect(errorMessage({ data: null, message: 'm2' })).toBe('m2')
    expect(errorMessage({ message: '' })).toBe('エラーが起きました')
    expect(errorMessage({})).toBe('エラーが起きました')
  })

  it('object でなければ文字列化', () => {
    expect(errorMessage('boom')).toBe('boom')
    expect(errorMessage(undefined)).toBe('undefined')
  })
})
