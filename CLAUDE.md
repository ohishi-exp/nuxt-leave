# nuxt-leave

休暇申請書 (有給・労災・特別休暇・欠勤) の PDF を 1 ページずつ乗務員と期間に紐づける管理画面。
親: ohishi-exp/rust-leave-worker#1。back は rust-leave-worker の `/api/leave/*` (admin と休暇申請ロール = 権限 leave.use を back が判定。403 は `admin_only` / `forbidden` の 2 種)。

## 構成
- Nuxt 4 + @nuxt/ui、SPA (`ssr: false`)、Cloudflare Workers (`cloudflare_module`)
- API は `$fetch('/api/proxy/api/...')` → `server/api/proxy` → auth-worker `/alc-proxy` (service binding `AUTH_WORKER`)
- 型と呼び出しは `app/utils/leave-api.ts` に集約。画面は `useLeaveApi()` (Bearer を載せ、401 で /login)
- 画面: `/` 一覧 (unlinked/linked/ignored)、`/pages/[id]` 紐づけ (pdfjs-dist で該当ページだけ描く)、`/settings`
- LINE WORKS の bot / グループは rust-alc-api の既存の口 (`/api/admin/bot/configs`・`/api/notify/lineworks/channels`)
- 複合機の WebDAV 送信の入口は auth-worker の `/m/leave-scan/**` (Basic を照合して Service Binding で中継)。受けるのは `server/routes/dav/[...path].ts` (判定は `server/utils/dav.ts`) で、`X-Internal-Shared-Secret` が一致しない直アクセスは 404。PUT の PDF は auth-worker の RPC `AUTH_MCRED.issueTicket` でチケットを貰い R2 `LEAVE_INBOX` に置く (会社は決めない)。送信用の資格情報は `/settings` から auth-worker `/api/machine-credentials` を直接叩く

## テスト
- 純粋な変換・検証は `app/utils/*.ts` に置き、`tests/utils/` で単体テスト → `coverage_100.toml` に登録 (100%)
- `.vue` は登録しない
- `npm test` / `npm run typecheck`

## 罠
- `@ippoan/*` は GitHub Packages。ローカルで npm install が通らないときは CI (PR) が初検証。lock は `regen-lockfile` workflow が作る
- `@nuxt/schema` が二重に入ると nuxt.config の `nitro.preset` が型エラーになる (nuxt と @nuxt/ui の版を揃える)
- wrangler.toml の named env は binding を継承しない → env ごとに再宣言。`[secrets] required = []` も各 env で
- Secrets Store binding 名に `NUXT_PUBLIC_` を付けない (起動時 crash)
- `.ippoan-dev.yaml` は置かない (dev-proxy の registry 未登録だと CI が落ちる)
- merge (auto-merge) で出るのは staging まで (本番には出ない)。本番は Tag Release (workflow_dispatch、入力なし) を手で打つ。back と auth-worker の振り分けが本番に出る前に Tag Release しない
