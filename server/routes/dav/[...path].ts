/**
 * 複合機の WebDAV 送信を受ける /dav/**。判定は server/utils/dav.ts。
 * PUT の PDF は auth-worker の RPC でチケットを貰い、R2 (LEAVE_INBOX) に置く。
 * 取り込みは R2 通知 → Queue → rust-leave-worker。
 */
import { defineEventHandler, getRequestURL, setResponseHeaders, setResponseStatus, toWebRequest } from 'h3'
import { cfEnv } from '../../utils/cf-env'
import {
  handlePut,
  hasAuthorization,
  logLine,
  planReply,
  readBodyLimited,
  type DavOutcome,
  type InboxBucket,
  type MachineCredentialRpc,
} from '../../utils/dav'

interface DavEnv {
  AUTH_MCRED: MachineCredentialRpc
  LEAVE_INBOX: InboxBucket
}

export default defineEventHandler(async (event) => {
  const req = toWebRequest(event)
  const path = getRequestURL(event).pathname
  const authorization = req.headers.get('authorization')

  let bodyBytes = 0
  let outcome: DavOutcome
  // PUT は認証が付いているときだけ本文を読む (無ければ planReply が 401 を返す)
  if (event.method.toUpperCase() === 'PUT' && hasAuthorization(authorization)) {
    const body = await readBodyLimited(req.body, req.headers.get('content-length'))
    bodyBytes = body?.byteLength ?? Number(req.headers.get('content-length') ?? 0)
    const env = cfEnv<DavEnv>(event)
    outcome = await handlePut(path, authorization, body, {
      mcred: env.AUTH_MCRED,
      inbox: env.LEAVE_INBOX,
      uuid: () => crypto.randomUUID(),
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
