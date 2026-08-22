<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Humphry"
    description="Your Humboldt Kitchen sous-chef"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <div class="mb-3 flex justify-end">
          <UButton
            to="/humphry"
            variant="ghost"
            color="neutral"
            size="xs"
            trailing-icon="i-lucide-arrow-up-right"
            @click="open = false"
          >
            Open full page
          </UButton>
        </div>
        <HumphryChatPanel compact />
      </div>
    </template>
  </USlideover>
</template>
