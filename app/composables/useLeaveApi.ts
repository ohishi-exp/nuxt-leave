import { useAuth } from '@ippoan/auth-client'
import { createLeaveApi, errorStatus, type Fetcher } from '~/utils/leave-api'

/**
 * 画面用の API。$fetch に browser JWT (Bearer) を載せ、401 (ログイン切れ) なら
 * 認証状態を捨てて /login へ戻す。
 */
export function useLeaveApi() {
  const { token, clearAuth } = useAuth()

  const fetcher: Fetcher = async <T>(url: string, options: Parameters<Fetcher>[1] = {}) => {
    const headers: Record<string, string> = {}
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

  return createLeaveApi(fetcher)
}
