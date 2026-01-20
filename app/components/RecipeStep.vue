<template>
  <div
    :id="titleId"
    class=""
  >
    <h3 class="text-xl font-serif text-pretty mb-2">
      {{ index }}. {{ title }}
    </h3>
    <div class="prose max-w-none">
      <p v-html="parsedContent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'

const props = defineProps({
  index: Number,
  title: String,
  content: String
})

const titleId = computed(() => props.title.toLowerCase().replace(/\s/g, '-'))

const parsedContent = computed(() => {
  // return content - from markdown to html
  return marked(props.content)
})
</script>
