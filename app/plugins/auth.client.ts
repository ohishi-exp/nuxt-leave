/**
 * Auth プラグイン (ブラウザ専用)
 *
 * アプリ起動時に auth-worker JWT を復元/検証し、未認証なら auth-worker ログイン
 * 画面へリダイレクトする。共通フローは @ippoan/auth-client の initAuthSession に集約
 * (nuxt-ichibanboshi-seikyu と同じ)。tenant / 管理者の制限は auth-worker と back が持つ。
 */
import { initAuthSession } from '@ippoan/auth-client'

export default defineNuxtPlugin({
  name: 'auth',
  enforce: 'pre',
  setup() {
    // ?lw= の処理は使わない (この画面は LINE WORKS から開かない)。
    initAuthSession({ lineWorksParam: false })
  },
})
