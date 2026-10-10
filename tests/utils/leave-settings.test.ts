import { describe, it, expect } from 'vitest'
import {
  channelTarget,
  formToSettingsBody,
  invalidSenders,
  MAILBOX_DOMAIN,
  mailboxAddress,
  mailboxError,
  normalizeMailbox,
  notifyTargetFromSettings,
  notifyTargetToSettings,
  hasSavedNotifyTarget,
  hasUnsavedChanges,
  parseSenders,
  testNotifyBlocker,
  recipientTarget,
  settingsToForm,
  validateSettingsForm,
  type SettingsForm,
} from '~/utils/leave-settings'

const MSG = '受信アドレスは英小文字・数字・ハイフンの 3〜64 文字です'

describe('mailbox', () => {
  it('trim して小文字', () => {
    expect(normalizeMailbox('  Ohishi-Leave1 ')).toBe('ohishi-leave1')
  })

  it('正しい形と空は問題なし', () => {
    expect(mailboxError('abc')).toBeNull()
    expect(mailboxError(' Ohishi ')).toBeNull()
    expect(mailboxError('a'.repeat(64))).toBeNull()
    expect(mailboxError('')).toBeNull()
    expect(mailboxError('   ')).toBeNull()
  })

  it('形が違えば文', () => {
    for (const bad of ['ab', 'a'.repeat(65), 'a_b_c', 'a.b.c', 'abc@x', 'あいう', 'a b c']) {
      expect(mailboxError(bad), bad).toBe(MSG)
    }
  })

  it('完全なアドレス', () => {
    expect(MAILBOX_DOMAIN).toBe('leave.ippoan.org')
    expect(mailboxAddress('Ohishi')).toBe('ohishi@leave.ippoan.org')
    expect(mailboxAddress('')).toBeNull()
    expect(mailboxAddress('a_b')).toBeNull()
  })
})

describe('差出人', () => {
  it('改行・カンマ・空白で分けて小文字・重複除去', () => {
    expect(parseSenders(' A@X.example \na@x.example, b@y.example、c@z.example\n\n'))
      .toEqual(['a@x.example', 'b@y.example', 'c@z.example'])
    expect(parseSenders('')).toEqual([])
  })

  it('メールの形でないもの', () => {
    expect(invalidSenders(['a@x.example', 'nope', 'a@b'])).toEqual(['nope', 'a@b'])
  })
})

describe('フォーム ↔ API', () => {
  const api = {
    mailbox: 'ohishi',
    allowed_senders: ['a@x.example', 'b@y.example'],
    dept_codes: ['10', '20'],
    lineworks_channel_id: 'ch-1',
    notify_recipient_id: null,
    grace_days: 3,
    enabled: true,
    updated_at: '2026-10-10T00:00:00Z',
  }

  it('API → フォーム', () => {
    expect(settingsToForm(api)).toEqual({
      mailbox: 'ohishi',
      allowedSendersText: 'a@x.example\nb@y.example',
      dept_codes: ['10', '20'],
      notify_target: 'channel:ch-1',
      grace_days: 3,
      enabled: true,
    })
  })

  it('null の項目は空に', () => {
    const f = settingsToForm({ ...api, mailbox: null, lineworks_channel_id: null, allowed_senders: [] })
    expect(f.mailbox).toBe('')
    expect(f.notify_target).toBe('')
    expect(f.allowedSendersText).toBe('')
  })

  it('フォーム → API (往復で同じ)', () => {
    const { updated_at: _, ...body } = api
    expect(formToSettingsBody(settingsToForm(api))).toEqual(body)
  })

  it('空は null、部門は trim・重複除去', () => {
    const f: SettingsForm = {
      mailbox: '  ',
      allowedSendersText: '',
      dept_codes: ['10', ' 10 ', '', '30'],
      notify_target: '',
      grace_days: 0,
      enabled: false,
    }
    expect(formToSettingsBody(f)).toEqual({
      mailbox: null,
      allowed_senders: [],
      dept_codes: ['10', '30'],
      lineworks_channel_id: null,
      notify_recipient_id: null,
      grace_days: 0,
      enabled: false,
    })
  })
})

describe('通知先 (グループ / 個人 / 通知しない)', () => {
  it('選択値は種別付き', () => {
    expect(channelTarget('c1')).toBe('channel:c1')
    expect(recipientTarget('r1')).toBe('recipient:r1')
  })

  it('2 列 → 選択値', () => {
    expect(notifyTargetFromSettings({ lineworks_channel_id: 'c1', notify_recipient_id: null })).toBe('channel:c1')
    expect(notifyTargetFromSettings({ lineworks_channel_id: null, notify_recipient_id: 'r1' })).toBe('recipient:r1')
    expect(notifyTargetFromSettings({ lineworks_channel_id: null, notify_recipient_id: null })).toBe('')
    expect(notifyTargetFromSettings({ lineworks_channel_id: '', notify_recipient_id: '' })).toBe('')
  })

  it('選択値 → 2 列 (選ばなかった方は null)', () => {
    expect(notifyTargetToSettings('channel:c1')).toEqual({ lineworks_channel_id: 'c1', notify_recipient_id: null })
    expect(notifyTargetToSettings('recipient:r1')).toEqual({ lineworks_channel_id: null, notify_recipient_id: 'r1' })
    expect(notifyTargetToSettings('')).toEqual({ lineworks_channel_id: null, notify_recipient_id: null })
    expect(notifyTargetToSettings('channel:')).toEqual({ lineworks_channel_id: null, notify_recipient_id: null })
    expect(notifyTargetToSettings('other:x')).toEqual({ lineworks_channel_id: null, notify_recipient_id: null })
  })

  it('個人を選んだ設定の往復', () => {
    const s = {
      mailbox: null,
      allowed_senders: [],
      dept_codes: [],
      lineworks_channel_id: null,
      notify_recipient_id: 'r1',
      grace_days: 7,
      enabled: true,
    }
    const f = settingsToForm(s)
    expect(f.notify_target).toBe('recipient:r1')
    expect(formToSettingsBody(f)).toEqual(s)
  })
})

describe('validateSettingsForm', () => {
  const ok: SettingsForm = {
    mailbox: 'ohishi',
    allowedSendersText: 'a@x.example',
    dept_codes: [],
    notify_target: '',
    grace_days: 60,
    enabled: true,
  }

  it('問題なし', () => {
    expect(validateSettingsForm(ok)).toEqual([])
  })

  it('全部の問題を並べる', () => {
    expect(validateSettingsForm({ ...ok, mailbox: 'x', allowedSendersText: 'a@x.example nope', grace_days: 61 }))
      .toEqual([
        MSG,
        '差出人のアドレスの形が正しくありません: nope',
        '警告の猶予日数は 0〜60 の整数です',
      ])
  })

  it('猶予日数の範囲と整数', () => {
    expect(validateSettingsForm({ ...ok, grace_days: -1 })).toHaveLength(1)
    expect(validateSettingsForm({ ...ok, grace_days: 1.5 })).toHaveLength(1)
    expect(validateSettingsForm({ ...ok, grace_days: 0 })).toEqual([])
  })
})

describe('テスト送信の判定', () => {
  const saved: SettingsForm = {
    mailbox: 'ohishi',
    allowedSendersText: 'a@x.example\nb@x.example',
    dept_codes: ['1', '2'],
    notify_target: 'channel:c1',
    grace_days: 7,
    enabled: true,
  }

  it('保存済みと同じなら変更なし (並び・大文字・重複は無視)', () => {
    expect(hasUnsavedChanges(saved, { ...saved })).toBe(false)
    expect(hasUnsavedChanges(saved, {
      ...saved,
      mailbox: ' OHISHI ',
      allowedSendersText: 'B@x.example, a@x.example, a@x.example',
      dept_codes: ['2', '1', '1'],
    })).toBe(false)
  })

  it('1 項目でも違えば未保存の変更', () => {
    expect(hasUnsavedChanges(saved, { ...saved, notify_target: 'recipient:r1' })).toBe(true)
    expect(hasUnsavedChanges(saved, { ...saved, grace_days: 8 })).toBe(true)
    expect(hasUnsavedChanges(saved, { ...saved, dept_codes: ['1'] })).toBe(true)
  })

  it('保存済みの通知先の有無', () => {
    expect(hasSavedNotifyTarget(saved)).toBe(true)
    expect(hasSavedNotifyTarget({ ...saved, notify_target: '' })).toBe(false)
  })

  it('押せる / 押せない', () => {
    expect(testNotifyBlocker(saved, { ...saved })).toBeNull()
    expect(testNotifyBlocker(saved, { ...saved, notify_target: 'channel:c2' })).toBe('unsaved')
    const none = { ...saved, notify_target: '' }
    expect(testNotifyBlocker(none, { ...none })).toBe('no_target')
    // 保存済みが「通知しない」のとき、フォームだけ選んでも押せない
    expect(testNotifyBlocker(none, saved)).toBe('no_target')
    expect(testNotifyBlocker(null, saved)).toBe('no_target')
  })
})
