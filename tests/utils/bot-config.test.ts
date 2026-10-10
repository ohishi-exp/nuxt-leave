import { describe, it, expect } from 'vitest'
import {
  botFormFromConfig,
  botWebhookUrl,
  channelLabel,
  emptyBotForm,
  toBotConfigBody,
  validateBotForm,
  type BotForm,
} from '~/utils/bot-config'

const filled: BotForm = {
  id: '',
  name: ' 休暇通知 ',
  client_id: ' cid ',
  service_account: ' sa@example ',
  bot_id: ' 123 ',
  enabled: true,
  client_secret: ' sec ',
  private_key: '\npem-line-1\npem-line-2\n',
  bot_secret: ' bs ',
}

describe('フォーム', () => {
  it('空のフォームは有効・全部空', () => {
    expect(emptyBotForm()).toEqual({
      id: '', name: '', client_id: '', service_account: '', bot_id: '', enabled: true,
      client_secret: '', private_key: '', bot_secret: '',
    })
  })

  it('一覧の行から編集フォーム (秘密値は空欄)', () => {
    expect(botFormFromConfig({
      id: 'b1', provider: 'lineworks', name: 'n', client_id: 'c', service_account: 's', bot_id: '9', enabled: false,
    })).toEqual({
      id: 'b1', name: 'n', client_id: 'c', service_account: 's', bot_id: '9', enabled: false,
      client_secret: '', private_key: '', bot_secret: '',
    })
  })
})

describe('validateBotForm', () => {
  it('新規は必須 4 項目と秘密値 2 つ', () => {
    expect(validateBotForm(emptyBotForm())).toEqual([
      '名前 を入れてください',
      'Client ID を入れてください',
      'Service Account を入れてください',
      'Bot ID を入れてください',
      'Client Secret を入れてください',
      'Private Key を入れてください',
    ])
    expect(validateBotForm(filled)).toEqual([])
  })

  it('編集は秘密値が空でよい', () => {
    expect(validateBotForm({ ...filled, id: 'b1', client_secret: '', private_key: '', bot_secret: '' })).toEqual([])
  })
})

describe('toBotConfigBody', () => {
  it('新規: trim し、id を載せない', () => {
    expect(toBotConfigBody(filled)).toEqual({
      provider: 'lineworks',
      name: '休暇通知',
      client_id: 'cid',
      service_account: 'sa@example',
      bot_id: '123',
      enabled: true,
      client_secret: 'sec',
      private_key: 'pem-line-1\npem-line-2',
      bot_secret: 'bs',
    })
  })

  it('編集: 空の秘密値は載せない (据え置き)', () => {
    const body = toBotConfigBody({ ...filled, id: 'b1', client_secret: ' ', private_key: '', bot_secret: '' })
    expect(body).toEqual({
      id: 'b1',
      provider: 'lineworks',
      name: '休暇通知',
      client_id: 'cid',
      service_account: 'sa@example',
      bot_id: '123',
      enabled: true,
    })
  })
})

describe('表示', () => {
  it('webhook URL は末尾の / を重ねない', () => {
    expect(botWebhookUrl('https://auth.example/', '123')).toBe('https://auth.example/lineworks/webhook/123')
    expect(botWebhookUrl('https://auth.example', 'a b')).toBe('https://auth.example/lineworks/webhook/a%20b')
  })

  it('グループ名が無ければ channel_id', () => {
    expect(channelLabel({ title: '休暇', channel_id: 'c1' })).toBe('休暇')
    expect(channelLabel({ title: ' ', channel_id: 'c1' })).toBe('c1')
    expect(channelLabel({ title: null, channel_id: 'c1' })).toBe('c1')
  })
})
