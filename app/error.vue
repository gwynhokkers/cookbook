<template>
  <div class="error">
    {{ error.statusCode }}: {{ error.message }}

    <div
      class=""
      v-html="error.stack"
    />
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

useSeoMeta({
  title: 'Page not found',
  description: 'We are sorry but this page could not be found.'
})

defineProps({
  error: {
    type: Object as PropType<NuxtError>,
    required: true
  }
})

useHead({
  htmlAttrs: {
    lang: 'en'
  }
})
</script>
