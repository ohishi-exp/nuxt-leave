<script setup lang="ts">
import { useAuth } from '@ippoan/auth-client'

definePageMeta({ layout: 'auth' })

const { redirectToLogin } = useAuth()
const config = useRuntimeConfig()

onMounted(() => {
  if (config.public.authWorkerUrl) {
    redirectToLogin({ provider: 'google', callbackPath: '/auth/callback' })
  }
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div class="space-y-4 text-center">
      <h1 class="text-2xl font-bold">休暇申請の紐づけ</h1>
      <UButton
        label="Google でログイン"
        icon="i-lucide-log-in"
        size="lg"
        block
        @click="redirectToLogin({ provider: 'google', callbackPath: '/auth/callback' })"
      />
    </div>
  </UCard>
</template>
