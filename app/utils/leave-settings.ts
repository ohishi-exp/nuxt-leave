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
  /** 通知先。`channel:<id>` / `recipient:<id>`、通知しないは空文字 */
  notify_target: string
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

const CHANNEL_PREFIX = 'channel:'
const RECIPIENT_PREFIX = 'recipient:'

export function channelTarget(id: string): string {
  return `${CHANNEL_PREFIX}${id}`
}

export function recipientTarget(id: string): string {
  return `${RECIPIENT_PREFIX}${id}`
}

/** 設定の 2 列 → 通知先の選択値 (グループを優先。どちらも無ければ空文字) */
export function notifyTargetFromSettings(
  s: Pick<LeaveSettings, 'lineworks_channel_id' | 'notify_recipient_id'>,
): string {
  if (s.lineworks_channel_id) return channelTarget(s.lineworks_channel_id)
  if (s.notify_recipient_id) return recipientTarget(s.notify_recipient_id)
  return ''
}

/** 通知先の選択値 → 設定の 2 列 (選ばなかった方は null) */
export function notifyTargetToSettings(
  target: string,
): Pick<SettingsBody, 'lineworks_channel_id' | 'notify_recipient_id'> {
  const pick = (prefix: string) => {
    const id = target.startsWith(prefix) ? target.slice(prefix.length) : ''
    return id === '' ? null : id
  }
  return {
    lineworks_channel_id: pick(CHANNEL_PREFIX),
    notify_recipient_id: pick(RECIPIENT_PREFIX),
  }
}

export function settingsToForm(s: LeaveSettings): SettingsForm {
  return {
    mailbox: s.mailbox ?? '',
    allowedSendersText: s.allowed_senders.join('\n'),
    dept_codes: [...s.dept_codes],
    notify_target: notifyTargetFromSettings(s),
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
    ...notifyTargetToSettings(f.notify_target),
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

/** フォームが保存済みの値と違うか (差出人・部門の並びや重複の違いは無視する) */
export function hasUnsavedChanges(saved: SettingsForm, current: SettingsForm): boolean {
  const key = (f: SettingsForm) => {
    const b = formToSettingsBody(f)
    return JSON.stringify({
      ...b,
      allowed_senders: [...b.allowed_senders].sort(),
      dept_codes: [...b.dept_codes].sort(),
    })
  }
  return key(saved) !== key(current)
}

/** 保存済みの通知先があるか (「通知しない」なら false) */
export function hasSavedNotifyTarget(saved: SettingsForm): boolean {
  return saved.notify_target !== ''
}

/** テスト送信を押せない理由 (押せるなら null)。送るのは保存済みの通知先なので */
export function testNotifyBlocker(saved: SettingsForm | null, current: SettingsForm): 'unsaved' | 'no_target' | null {
  if (saved === null || !hasSavedNotifyTarget(saved)) return 'no_target'
  return hasUnsavedChanges(saved, current) ? 'unsaved' : null
}
