import { describe, it, expect } from 'vitest'
import {
  channelTarget,
  formToSettingsBody,
  notifyBotOptions,
  notifyBotToSettings,
  notifyTargetFromSettings,
  notifyTargetToSettings,
  hasSavedNotifyTarget,
  hasUnsavedChanges,
  testNotifyBlocker,
  recipientTarget,
  settingsToForm,
  validateSettingsForm,
  type SettingsForm,
} from '~/utils/leave-settings'

describe('フォーム ↔ API', () => {
  const api = {
    dept_codes: ['10', '20'],
    lineworks_channel_id: 'ch-1',
    notify_recipient_id: null,
    notify_bot_config_id: null,
    grace_days: 3,
    enabled: true,
    updated_at: '2026-10-10T00:00:00Z',
  }

  it('API → フォーム', () => {
    expect(settingsToForm(api)).toEqual({
      dept_codes: ['10', '20'],
      notify_target: 'channel:ch-1',
      notify_bot_config_id: '',
      grace_days: 3,
      enabled: true,
    })
  })

  it('null の項目は空に', () => {
    const f = settingsToForm({ ...api, lineworks_channel_id: null })
    expect(f.notify_target).toBe('')
  })

  it('フォーム → API (往復で同じ)', () => {
    const { updated_at: _, ...body } = api
    expect(formToSettingsBody(settingsToForm(api))).toEqual(body)
  })

  it('空は null、部門は trim・重複除去', () => {
    const f: SettingsForm = {
      dept_codes: ['10', ' 10 ', '', '30'],
      notify_target: '',
      notify_bot_config_id: 'b1',
      grace_days: 0,
      enabled: false,
    }
    expect(formToSettingsBody(f)).toEqual({
      dept_codes: ['10', '30'],
      lineworks_channel_id: null,
      notify_recipient_id: null,
      notify_bot_config_id: null,
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
      dept_codes: [],
      lineworks_channel_id: null,
      notify_recipient_id: 'r1',
      notify_bot_config_id: 'b1',
      grace_days: 7,
      enabled: true,
    }
    const f = settingsToForm(s)
    expect(f.notify_target).toBe('recipient:r1')
    expect(f.notify_bot_config_id).toBe('b1')
    expect(formToSettingsBody(f)).toEqual(s)
  })

  it('グループ・通知しないでは bot を送らない (null)', () => {
    const f: SettingsForm = {
      dept_codes: [],
      notify_target: 'recipient:r1',
      notify_bot_config_id: 'b1',
      grace_days: 7,
      enabled: true,
    }
    expect(formToSettingsBody({ ...f, notify_target: 'channel:ch-1' }).notify_bot_config_id).toBeNull()
    expect(formToSettingsBody({ ...f, notify_target: '' }).notify_bot_config_id).toBeNull()
  })

  it('bot 変換と選択肢の絞り込み', () => {
    expect(notifyBotToSettings('recipient:r1', 'b1')).toBe('b1')
    expect(notifyBotToSettings('recipient:r1', '')).toBeNull()
    expect(notifyBotToSettings('channel:c1', 'b1')).toBeNull()
    const bots = [
      { id: 'a', provider: 'lineworks', enabled: true },
      { id: 'b', provider: 'lineworks', enabled: false },
      { id: 'c', provider: 'other', enabled: true },
    ]
    expect(notifyBotOptions(bots).map(b => b.id)).toEqual(['a'])
  })
})

describe('validateSettingsForm', () => {
  const ok: SettingsForm = {
    dept_codes: [],
    notify_target: '',
    notify_bot_config_id: '',
    grace_days: 60,
    enabled: true,
  }

  it('問題なし', () => {
    expect(validateSettingsForm(ok)).toEqual([])
  })

  it('全部の問題を並べる', () => {
    expect(validateSettingsForm({ ...ok, grace_days: 61 }))
      .toEqual(['警告の猶予日数は 0〜60 の整数です'])
  })

  it('個人を選んだら bot は必須', () => {
    const r = { ...ok, notify_target: 'recipient:r1' }
    expect(validateSettingsForm(r)).toEqual(['送る bot を選んでください'])
    expect(validateSettingsForm({ ...r, notify_bot_config_id: 'b1' })).toEqual([])
    expect(validateSettingsForm({ ...ok, notify_target: 'channel:c1' })).toEqual([])
  })

  it('猶予日数の範囲と整数', () => {
    expect(validateSettingsForm({ ...ok, grace_days: -1 })).toHaveLength(1)
    expect(validateSettingsForm({ ...ok, grace_days: 1.5 })).toHaveLength(1)
    expect(validateSettingsForm({ ...ok, grace_days: 0 })).toEqual([])
  })
})

describe('テスト送信の判定', () => {
  const saved: SettingsForm = {
    dept_codes: ['1', '2'],
    notify_target: 'channel:c1',
    notify_bot_config_id: '',
    grace_days: 7,
    enabled: true,
  }

  it('保存済みと同じなら変更なし (部門の並び・重複は無視)', () => {
    expect(hasUnsavedChanges(saved, { ...saved })).toBe(false)
    expect(hasUnsavedChanges(saved, {
      ...saved,
      dept_codes: ['2', '1', '1'],
    })).toBe(false)
  })

  it('1 項目でも違えば未保存の変更', () => {
    expect(hasUnsavedChanges(saved, { ...saved, notify_target: 'recipient:r1' })).toBe(true)
    expect(hasUnsavedChanges(saved, { ...saved, grace_days: 8 })).toBe(true)
    expect(hasUnsavedChanges(saved, { ...saved, dept_codes: ['1'] })).toBe(true)
  })

  it('bot を変えたら未保存の変更', () => {
    const r = { ...saved, notify_target: 'recipient:r1', notify_bot_config_id: 'b1' }
    expect(hasUnsavedChanges(r, { ...r })).toBe(false)
    expect(hasUnsavedChanges(r, { ...r, notify_bot_config_id: 'b2' })).toBe(true)
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
