import { describe, it, expect, vi } from 'vitest'
import {
  API_BASE,
  createLeaveApi,
  errorMessage,
  errorStatus,
  FORBIDDEN_MESSAGE,
  isForbidden,
  listDocumentsQuery,
  listPagesQuery,
  PAGE_LIMIT,
  pagePdfUrl,
  pageUrl,
  botConfigUrl,
  grantUrl,
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

  it('一覧の query は r2_key だけでも組める (status は付けない)', () => {
    expect(listPagesQuery({ r2_key: 'k/a.pdf', limit: 200 })).toEqual({ r2_key: 'k/a.pdf', limit: 200, offset: 0 })
  })

  it('documents の query は state open・limit 50・offset 0 が既定', () => {
    expect(listDocumentsQuery({})).toEqual({ state: 'open', limit: PAGE_LIMIT, offset: 0 })
    expect(listDocumentsQuery({ state: 'all', limit: 10, offset: 20 })).toEqual({ state: 'all', limit: 10, offset: 20 })
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

  it('listDocuments は data を返し query を渡す', async () => {
    const { fetcher, calls } = fakeFetcher({ data: [{ r2_key: 'k' }] })
    const r = await createLeaveApi(fetcher).listDocuments({ state: 'done', offset: 50 })
    expect(r).toEqual([{ r2_key: 'k' }])
    expect(calls[0]).toEqual({
      url: '/api/proxy/api/leave/documents',
      options: { query: { state: 'done', limit: 50, offset: 50 } },
    })
    await createLeaveApi(fetcher).listDocuments()
    expect(calls[1]!.options).toEqual({ query: { state: 'open', limit: 50, offset: 0 } })
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
    const { fetcher, calls } = fakeFetcher({ grace_days: 3 })
    const api = createLeaveApi(fetcher)
    expect(await api.getSettings()).toEqual({ grace_days: 3 })
    const body = { dept_codes: [], lineworks_channel_id: null, notify_recipient_id: null, notify_bot_config_id: null, grace_days: 7, enabled: true }
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
    expect(errorMessage({ status: 400, data: { error: 'unknown_notify_recipient' } })).toBe('選んだ個人が見つかりません')
    expect(errorMessage({ status: 400, data: { error: 'unknown_notify_bot' } })).toBe('選んだ bot が使えません')
    expect(errorMessage({ status: 400, data: { error: 'notify_bot_without_recipient' } })).toBe('bot は個人を選んだときだけ指定できます')
    expect(errorMessage({ status: 400, data: { error: 'both_notify_targets' } })).toBe('通知先は 1 つだけ選んでください')
    expect(errorMessage({ status: 404, data: { error: 'no_notify_target' } })).toBe('通知先が保存されていません')
    expect(errorMessage({ status: 502, data: { error: 'notify_failed' } })).toBe('送信に失敗しました')
    expect(errorMessage({ status: 503, data: { error: 'notify_unavailable' } })).toBe('この環境では送れません')
    expect(errorMessage({ status: 400, data: { error: 'something_new' } })).toBe('something_new')
  })

  it('期首残のエラー語', () => {
    const msg = (c: string) => errorMessage({ status: 400, data: { error: c } })
    expect(msg('invalid_as_of')).toBe('期首日が正しくありません')
    expect(msg('invalid_body')).toBe('入力が正しくありません')
    expect(msg('too_many_rows')).toBe('一度に保存できるのは 1000 人までです')
    expect(msg('unknown_employee')).toBe('部門外か存在しない乗務員が含まれています')
    expect(msg('opening_no_prior_grant')).toBe('前年の付与が無いので繰越は入れられません')
    expect(msg('opening_no_current_grant')).toBe('今年度の付与が無いので今年度分は入れられません')
  })

  it('listOpening は data を剥がし、saveOpening は PUT', async () => {
    const { fetcher, calls } = fakeFetcher({ data: [{ employee_cd: '1' }], saved: 1, deleted: 0 })
    const api = createLeaveApi(fetcher)
    expect(await api.listOpening()).toEqual([{ employee_cd: '1' }])
    const body = { as_of: '2026-10-10', rows: [{ employee_cd: '1', carryover: 1, current: null }] }
    await api.saveOpening(body)
    expect(calls).toEqual([
      { url: '/api/proxy/api/leave/opening', options: undefined },
      { url: '/api/proxy/api/leave/opening', options: { method: 'PUT', body } },
    ])
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

describe('カレンダーと付与台帳', () => {
  it('grantUrl は id を encode する', () => {
    expect(grantUrl('a/b')).toBe('/api/proxy/api/leave/grants/a%2Fb')
  })

  it('getCalendar は employee_cd と month を query で渡す', async () => {
    const { fetcher, calls } = fakeFetcher({ days: [] })
    const r = await createLeaveApi(fetcher).getCalendar('101', '2026-02')
    expect(r).toEqual({ days: [] })
    expect(calls[0]).toEqual({
      url: '/api/proxy/api/leave/calendar',
      options: { query: { employee_cd: '101', month: '2026-02' } },
    })
  })

  it('listGrants は employee_cd を query で渡す', async () => {
    const { fetcher, calls } = fakeFetcher({ data: [] })
    await createLeaveApi(fetcher).listGrants('101')
    expect(calls[0]).toEqual({
      url: '/api/proxy/api/leave/grants',
      options: { query: { employee_cd: '101' } },
    })
  })

  it('createGrant は POST、updateGrant は PUT、deleteGrant は DELETE', async () => {
    const { fetcher, calls } = fakeFetcher({ id: 'g1' })
    const api = createLeaveApi(fetcher)
    const body = { employee_cd: '101', grant_date: '2026-04-01', days: 10, expires_on: null, note: null }
    await api.createGrant(body)
    await api.updateGrant('g 1', { days: 5, expires_on: '2028-04-01', note: null })
    await api.deleteGrant('g1')
    expect(calls[0]).toEqual({ url: '/api/proxy/api/leave/grants', options: { method: 'POST', body } })
    expect(calls[1]).toEqual({
      url: '/api/proxy/api/leave/grants/g%201',
      options: { method: 'PUT', body: { days: 5, expires_on: '2028-04-01', note: null } },
    })
    expect(calls[2]).toEqual({ url: '/api/proxy/api/leave/grants/g1', options: { method: 'DELETE' } })
  })

  it('autoGrants は POST で employee_cd を query に', async () => {
    const { fetcher, calls } = fakeFetcher({ inserted: 2 })
    const r = await createLeaveApi(fetcher).autoGrants('101')
    expect(r).toEqual({ inserted: 2 })
    expect(calls[0]).toEqual({
      url: '/api/proxy/api/leave/grants/auto',
      options: { method: 'POST', query: { employee_cd: '101' } },
    })
  })

  it('追加したエラーの語は日本語になる', () => {
    const msg = (error: string) => errorMessage({ status: 400, data: { error } })
    expect(msg('invalid_month')).toBe('月の形が正しくありません')
    expect(msg('grant_exists')).toBe('同じ付与日の行があります')
    expect(msg('invalid_days')).toBe('日数は 0〜999.9 (小数 1 桁) で入れてください')
    expect(msg('invalid_grant_date')).toBe('付与日が正しくありません')
    expect(msg('expires_before_grant')).toBe('期限が付与日より前です')
  })
})
