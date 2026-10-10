import { authMiddleware } from '@ippoan/auth-client'

// 全画面ログイン必須 (管理者かどうかは back の /api/leave/* が 403 で判定する)
export default defineNuxtRouteMiddleware(
  authMiddleware({ publicPaths: ['/login', '/auth/callback'] }),
)
