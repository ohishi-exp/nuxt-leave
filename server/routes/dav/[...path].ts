/**
 * 複合機の WebDAV 送信を受ける試験用の受け口 (/dav/**)。判定は server/utils/dav-probe.ts。
 * 届いたリクエストの形をログに 1 行出して応答するだけで、本文は読み捨てる。
 */
import { defineEventHandler, getRequestURL, setResponseHeaders, setResponseStatus, toWebRequest } from 'h3'
import { planReply, summarizeRequest } from '../../utils/dav-probe'

/** PROPFIND などの XML 本文は先頭だけログに出す (PUT の本文は出さない)。 */
const XML_LOG_LIMIT = 500

export default defineEventHandler(async (event) => {
  const req = toWebRequest(event)
  const path = getRequestURL(event).pathname
  const summary = summarizeRequest(event.method, path, req.headers)

  let bodyBytes = 0
  let xmlHead: string | undefined
  if (req.body) {
    const isXml = (req.headers.get('content-type') ?? '').includes('xml')
    const chunks: Uint8Array[] = []
    const reader = req.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bodyBytes += value.byteLength
      if (isXml && bodyBytes <= XML_LOG_LIMIT * 4) chunks.push(value)
    }
    if (isXml) {
      const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap(c => [...c])))
      xmlHead = text.slice(0, XML_LOG_LIMIT)
    }
  }

  const reply = planReply(event.method, path, summary.authScheme !== null)
  // CF Observability は構造化引数を展開しないので 1 行の文字列にする
  console.log(`dav-probe: ${JSON.stringify({ ...summary, bodyBytes, xmlHead, status: reply.status })}`)

  setResponseStatus(event, reply.status)
  setResponseHeaders(event, reply.headers)
  return reply.body ?? ''
})
