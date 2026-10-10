/**
 * LINE WORKS bot の登録フォーム ↔ `POST /api/admin/bot/configs` (rust-alc-api) の変換。
 * 秘密値 (client_secret / bot_secret) は入力欄だけで、取得した値を表示しない。
 * 編集のとき空のままなら body に載せない (= 既存の値を変えない)。
 */
import type { BotConfig, BotConfigBody, NotifyRecipient } from './leave-api'

export interface BotForm {
  id: string
  name: string
  client_id: string
  service_account: string
  bot_id: string
  enabled: boolean
  client_secret: string
  bot_secret: string
}

export function emptyBotForm(): BotForm {
  return {
    id: '',
    name: '',
    client_id: '',
    service_account: '',
    bot_id: '',
    enabled: true,
    client_secret: '',
    bot_secret: '',
  }
}

/** 一覧の行を編集フォームにする (秘密値は空欄から) */
export function botFormFromConfig(c: BotConfig): BotForm {
  return {
    ...emptyBotForm(),
    id: c.id,
    name: c.name,
    client_id: c.client_id,
    service_account: c.service_account,
    bot_id: c.bot_id,
    enabled: c.enabled,
  }
}

export function validateBotForm(f: BotForm): string[] {
  const errors: string[] = []
  const required: [keyof BotForm, string][] = [
    ['name', '名前'],
    ['client_id', 'Client ID'],
    ['service_account', 'Service Account'],
    ['bot_id', 'Bot ID'],
  ]
  for (const [key, label] of required) {
    if (String(f[key]).trim() === '') errors.push(`${label} を入れてください`)
  }
  // 新規は秘密値が無いと動かない (編集は空なら据え置き)
  if (f.id === '') {
    if (f.client_secret.trim() === '') errors.push('Client Secret を入れてください')
  }
  return errors
}

export function toBotConfigBody(f: BotForm): BotConfigBody {
  const body: BotConfigBody = {
    provider: 'lineworks',
    name: f.name.trim(),
    client_id: f.client_id.trim(),
    service_account: f.service_account.trim(),
    bot_id: f.bot_id.trim(),
    enabled: f.enabled,
  }
  if (f.id !== '') body.id = f.id
  if (f.client_secret.trim() !== '') body.client_secret = f.client_secret.trim()
  if (f.bot_secret.trim() !== '') body.bot_secret = f.bot_secret.trim()
  return body
}

/** LINE WORKS の Developer Console に入れる callback URL (auth-worker が受ける) */
export function botWebhookUrl(authWorkerUrl: string, botId: string): string {
  return `${authWorkerUrl.replace(/\/$/, '')}/lineworks/webhook/${encodeURIComponent(botId)}`
}

/** 通知先グループの選択肢 (title が無ければ channel_id) */
export function channelLabel(ch: { title: string | null, channel_id: string }): string {
  return ch.title?.trim() || ch.channel_id
}

/** 通知先に出せる個人 (LINE WORKS の有効な受信者だけ) */
export function lineworksRecipients(rs: NotifyRecipient[]): NotifyRecipient[] {
  return rs.filter(r => r.provider === 'lineworks' && r.enabled)
}

/** 通知先の個人の選択肢 (name が空なら id) */
export function recipientLabel(r: { name: string, id: string }): string {
  return r.name.trim() || r.id
}
