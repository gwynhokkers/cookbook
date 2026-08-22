<script setup lang="ts">
const { loggedIn } = useUserSession()
const slideoverOpen = ref(false)
</script>

<template>
  <div v-if="loggedIn">
    <UButton
      icon="i-lucide-chef-hat"
      color="primary"
      size="lg"
      class="fixed bottom-6 right-6 z-40 shadow-lg"
      aria-label="Ask Humphry"
      @click="slideoverOpen = true"
    />
    <HumphrySlideover v-model:open="slideoverOpen" />
  </div>
</template>
