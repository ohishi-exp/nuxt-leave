/**
 * 設定画面のフォーム ↔ `GET/PUT /api/leave/settings` の変換と検証。
 * 規則は back (rust-leave-worker の settings.rs) と同じ。
 */
import type { LeaveSettings, SettingsBody } from './leave-api'

export const GRACE_DAYS_MIN = 0
export const GRACE_DAYS_MAX = 60
export const DEFAULT_GRACE_DAYS = 7

export interface SettingsForm {
  dept_codes: string[]
  /** 通知先。`channel:<id>` / `recipient:<id>`、通知しないは空文字 */
  notify_target: string
  /** 個人宛てに送る bot の id (個人のときだけ使う。未選択は空文字) */
  notify_bot_config_id: string
  grace_days: number
  enabled: boolean
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

/** 通知先が個人のときだけ bot を送る (グループ・通知しないは null) */
export function notifyBotToSettings(target: string, botId: string): string | null {
  return target.startsWith(RECIPIENT_PREFIX) && botId !== '' ? botId : null
}

/** 個人宛てに選べる bot (LINE WORKS かつ有効) */
export function notifyBotOptions<T extends { provider: string, enabled: boolean }>(bots: T[]): T[] {
  return bots.filter(b => b.provider === 'lineworks' && b.enabled)
}

export function settingsToForm(s: LeaveSettings): SettingsForm {
  return {
    dept_codes: [...s.dept_codes],
    notify_target: notifyTargetFromSettings(s),
    notify_bot_config_id: s.notify_bot_config_id ?? '',
    grace_days: s.grace_days,
    enabled: s.enabled,
  }
}

export function formToSettingsBody(f: SettingsForm): SettingsBody {
  return {
    dept_codes: [...new Set(f.dept_codes.map(d => d.trim()).filter(d => d !== ''))],
    ...notifyTargetToSettings(f.notify_target),
    notify_bot_config_id: notifyBotToSettings(f.notify_target, f.notify_bot_config_id),
    grace_days: f.grace_days,
    enabled: f.enabled,
  }
}

/** 保存する前のフォームの問題 (空なら保存してよい) */
export function validateSettingsForm(f: SettingsForm): string[] {
  const errors: string[] = []
  if (!Number.isInteger(f.grace_days) || f.grace_days < GRACE_DAYS_MIN || f.grace_days > GRACE_DAYS_MAX) {
    errors.push(`警告の猶予日数は ${GRACE_DAYS_MIN}〜${GRACE_DAYS_MAX} の整数です`)
  }
  if (f.notify_target.startsWith(RECIPIENT_PREFIX) && f.notify_bot_config_id === '') {
    errors.push('送る bot を選んでください')
  }
  return errors
}

/** フォームが保存済みの値と違うか (部門の並びや重複の違いは無視する) */
export function hasUnsavedChanges(saved: SettingsForm, current: SettingsForm): boolean {
  const key = (f: SettingsForm) => {
    const b = formToSettingsBody(f)
    return JSON.stringify({
      ...b,
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
