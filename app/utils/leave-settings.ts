/**
 * 設定画面のフォーム ↔ `GET/PUT /api/leave/settings` の変換と検証。
 * 規則は back (rust-leave-worker の settings.rs) と同じ。
 */
import type { LeaveSettings, SettingsBody } from './leave-api'

export const MAILBOX_DOMAIN = 'leave.ippoan.org'
export const MAILBOX_PATTERN = /^[a-z0-9-]{3,64}$/
export const GRACE_DAYS_MIN = 0
export const GRACE_DAYS_MAX = 60
export const DEFAULT_GRACE_DAYS = 7

export interface SettingsForm {
  mailbox: string
  /** 差出人アドレス。1 行に 1 つ (カンマ・空白区切りも可) */
  allowedSendersText: string
  dept_codes: string[]
  /** 未選択は空文字 */
  lineworks_channel_id: string
  grace_days: number
  enabled: boolean
}

/** 前後の空白を落として小文字にする (空なら空文字) */
export function normalizeMailbox(raw: string): string {
  return raw.trim().toLowerCase()
}

/** mailbox の問題を文にする (空 = 受信しない は問題なし) */
export function mailboxError(raw: string): string | null {
  const v = normalizeMailbox(raw)
  if (v === '' || MAILBOX_PATTERN.test(v)) return null
  return '受信アドレスは英小文字・数字・ハイフンの 3〜64 文字です'
}

/** 完全な受信アドレス (mailbox が空か不正なら null) */
export function mailboxAddress(raw: string): string | null {
  const v = normalizeMailbox(raw)
  return v !== '' && MAILBOX_PATTERN.test(v) ? `${v}@${MAILBOX_DOMAIN}` : null
}

/** 差出人の入力を 1 つずつに分け、小文字にして重複と空を除く (順は保つ) */
export function parseSenders(text: string): string[] {
  const out: string[] = []
  for (const s of text.split(/[\s,、]+/)) {
    const v = s.trim().toLowerCase()
    if (v !== '' && !out.includes(v)) out.push(v)
  }
  return out
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** メールアドレスの形でない差出人 */
export function invalidSenders(senders: string[]): string[] {
  return senders.filter(s => !EMAIL_PATTERN.test(s))
}

export function settingsToForm(s: LeaveSettings): SettingsForm {
  return {
    mailbox: s.mailbox ?? '',
    allowedSendersText: s.allowed_senders.join('\n'),
    dept_codes: [...s.dept_codes],
    lineworks_channel_id: s.lineworks_channel_id ?? '',
    grace_days: s.grace_days,
    enabled: s.enabled,
  }
}

export function formToSettingsBody(f: SettingsForm): SettingsBody {
  const mailbox = normalizeMailbox(f.mailbox)
  return {
    mailbox: mailbox === '' ? null : mailbox,
    allowed_senders: parseSenders(f.allowedSendersText),
    dept_codes: [...new Set(f.dept_codes.map(d => d.trim()).filter(d => d !== ''))],
    lineworks_channel_id: f.lineworks_channel_id === '' ? null : f.lineworks_channel_id,
    grace_days: f.grace_days,
    enabled: f.enabled,
  }
}

/** 保存する前のフォームの問題 (空なら保存してよい) */
export function validateSettingsForm(f: SettingsForm): string[] {
  const errors: string[] = []
  const m = mailboxError(f.mailbox)
  if (m) errors.push(m)
  const bad = invalidSenders(parseSenders(f.allowedSendersText))
  if (bad.length > 0) errors.push(`差出人のアドレスの形が正しくありません: ${bad.join(', ')}`)
  if (!Number.isInteger(f.grace_days) || f.grace_days < GRACE_DAYS_MIN || f.grace_days > GRACE_DAYS_MAX) {
    errors.push(`警告の猶予日数は ${GRACE_DAYS_MIN}〜${GRACE_DAYS_MAX} の整数です`)
  }
  return errors
}
