/**
 * REST API プロキシ
 * /api/proxy/* → auth-worker /alc-proxy/* → 振り分け先 (/api/leave/* は rust-leave-worker)
 *
 * introspect / ACL / identity 注入は auth-worker `/alc-proxy/*` に集約されていて、
 * consumer は createAuthWorkerProxyHandler で service binding (AUTH_WORKER) に
 * thin-forward するだけ (nuxt-dtako-admin と同じ方式 B)。consumer が渡すのは
 * X-Alc-Proxy-Secret (=INTERNAL_SHARED_SECRET) + X-Alc-Proxy-Origin + browser JWT のみ。
 *
 * pathPrefix='/': 画面は `/api/proxy/api/leave/...` を叩くので catch-all path は
 * `api/leave/...` になり、'/' + それで `/api/leave/...` に一致する。
 */
import { defineEventHandler, createError } from 'h3'
import { createAuthWorkerProxyHandler } from '@ippoan/auth-client/server'
import { cfEnv, resolveSecret } from '../../utils/cf-env'

export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const sharedSecret = await resolveSecret(env.INTERNAL_SHARED_SECRET)
  if (!sharedSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'INTERNAL_SHARED_SECRET binding が未設定です',
    })
  }
  const authWorker = env.AUTH_WORKER as { fetch: typeof fetch } | undefined
  if (!authWorker) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AUTH_WORKER service binding が未設定です',
    })
  }

  const proxy = createAuthWorkerProxyHandler({
    sharedSecret,
    authWorkerFetch: () => authWorker.fetch.bind(authWorker),
    pathPrefix: '/',
  })
  return proxy(event)
})
