/**
 * Cloudflare Workers の env binding / Secrets Store 値を取り出す共通ヘルパ
 * (nuxt-dtako-admin の server/utils/cf-env.ts と同じ)。
 */
import type { H3Event } from 'h3'

/** Cloudflare Workers の env binding を H3Event から取り出す。 */
export function cfEnv<T = Record<string, unknown>>(event: H3Event): T {
  return ((event.context.cloudflare as { env?: T } | undefined)?.env ?? {}) as T
}

/** Secrets Store binding (`.get()`) / 文字列 のいずれでも値を取り出す。 */
export async function resolveSecret(binding: unknown): Promise<string | null> {
  if (typeof binding === 'string') return binding
  if (binding && typeof (binding as { get?: unknown }).get === 'function') {
    return (await (binding as { get(): Promise<string> }).get()) ?? null
  }
  return null
}
