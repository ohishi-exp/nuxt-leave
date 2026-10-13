<script setup lang="ts">
const route = useRoute()

const links = [
  { label: '申請書', to: '/', icon: 'i-lucide-inbox' },
  { label: 'カレンダー', to: '/calendar', icon: 'i-lucide-calendar-days' },
  { label: '有給台帳', to: '/grants', icon: 'i-lucide-book-open' },
  { label: '期首残', to: '/opening', icon: 'i-lucide-list-checks' },
  { label: '漏れ', to: '/alerts', icon: 'i-lucide-triangle-alert' },
  { label: '設定', to: '/settings', icon: 'i-lucide-settings' },
]

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' || route.path.startsWith('/pages/') : route.path.startsWith(to)
}
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <header class="border-b border-(--ui-border) bg-(--ui-bg)">
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <NuxtLink to="/" class="font-bold">休暇申請の紐づけ</NuxtLink>
        <nav class="flex gap-1">
          <UButton
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            :icon="l.icon"
            :label="l.label"
            :variant="isActive(l.to) ? 'soft' : 'ghost'"
            color="neutral"
            size="sm"
          />
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
