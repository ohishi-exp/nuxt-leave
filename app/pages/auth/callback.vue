<script setup lang="ts">
// callback の共通ロジック/UI は @ippoan/auth-client の AuthCallback に集約済み
import { AuthCallback } from '@ippoan/auth-client'

definePageMeta({ layout: 'auth' })
</script>

<template>
  <AuthCallback redirect-to="/" login-path="/login" />
</template>
