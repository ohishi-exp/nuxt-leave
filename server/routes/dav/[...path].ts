/**
 * 複合機の WebDAV 送信を受ける /dav/**。判定は server/utils/dav.ts。
 * auth-worker の `/m/leave-scan/**` からの中継 (X-Internal-Shared-Secret 付き) だけを処理し、それ以外は 404。
 * PUT の PDF は auth-worker の RPC でチケットを貰い、R2 (LEAVE_INBOX) に置く。
 * 取り込みは R2 通知 → Queue → rust-leave-worker。
 */
import { defineEventHandler, getRequestURL, setResponseHeaders, setResponseStatus, toWebRequest } from 'h3'
import { cfEnv, resolveSecret } from '../../utils/cf-env'
import {
  NOT_RELAYED,
  handlePut,
  hasAuthorization,
  isRelayed,
  logLine,
  planReply,
  readBodyLimited,
  type DavOutcome,
  type InboxBucket,
  type LeaveFetcher,
  type MachineCredentialRpc,
} from '../../utils/dav'

interface DavEnv {
  INTERNAL_SHARED_SECRET: unknown
  AUTH_MCRED: MachineCredentialRpc
  LEAVE_INBOX: InboxBucket
  /** 受信アドレス照合用 (preview env には置かない → 無ければ PUT は 503) */
  LEAVE_WORKER?: LeaveFetcher
}

export default defineEventHandler(async (event) => {
  const req = toWebRequest(event)
  const path = getRequestURL(event).pathname
  const authorization = req.headers.get('authorization')
  const env = cfEnv<DavEnv>(event)
  const secret = await resolveSecret(env.INTERNAL_SHARED_SECRET)

  let bodyBytes = 0
  let outcome: DavOutcome
  if (!isRelayed(req.headers.get('x-internal-shared-secret'), secret)) {
    await req.body?.cancel()
    outcome = NOT_RELAYED
  }
  // PUT は認証が付いているときだけ本文を読む (無ければ planReply が 401 を返す)
  else if (event.method.toUpperCase() === 'PUT' && hasAuthorization(authorization)) {
    const body = await readBodyLimited(req.body, req.headers.get('content-length'))
    bodyBytes = body?.byteLength ?? Number(req.headers.get('content-length') ?? 0)
    outcome = await handlePut(path, authorization, body, {
      mcred: env.AUTH_MCRED,
      inbox: env.LEAVE_INBOX,
      uuid: () => crypto.randomUUID(),
      leave: env.LEAVE_WORKER,
      secret,
    })
  }
  else {
    await req.body?.cancel()
    outcome = planReply(event.method, path, hasAuthorization(authorization))
  }

  console.log(logLine(event.method, path, bodyBytes, outcome))

  setResponseStatus(event, outcome.reply.status)
  setResponseHeaders(event, outcome.reply.headers)
  return outcome.reply.body ?? ''
})
