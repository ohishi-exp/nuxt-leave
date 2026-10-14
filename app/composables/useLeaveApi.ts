import { useAuth } from '@ippoan/auth-client'
import { createLeaveApi, errorStatus, type Fetcher } from '~/utils/leave-api'
import { createMachineCredentialApi } from '~/utils/machine-credentials'

/**
 * $fetch に browser JWT (Bearer) を載せ、401 (ログイン切れ) なら認証状態を捨てて /login へ戻す fetcher。
 */
function useAuthedFetcher(): Fetcher {
  const { token, clearAuth } = useAuth()

  return async <T>(url: string, options: Parameters<Fetcher>[1] = {}) => {
    const headers: Record<string, string> = { ...options.headers }
    if (token.value) headers.Authorization = `Bearer ${token.value}`
    try {
      return await $fetch<T>(url, {
        method: options.method ?? 'GET',
        body: options.body as Record<string, unknown> | undefined,
        query: options.query,
        responseType: options.responseType ?? 'json',
        headers,
      }) as T
    }
    catch (e) {
      if (errorStatus(e) === 401) {
        clearAuth()
        await navigateTo('/login')
      }
      throw e
    }
  }
}

/** 画面用の API (/api/proxy 経由で rust-leave-worker・rust-alc-api) */
export function useLeaveApi() {
  return createLeaveApi(useAuthedFetcher())
}

/** スキャン送信用の資格情報の管理 API (auth-worker を直接叩く。同じ JWT) */
export function useMachineCredentialApi() {
  return createMachineCredentialApi(useAuthedFetcher(), String(useRuntimeConfig().public.authWorkerUrl ?? ''))
}
