<template>
  <div :id="titleId">
    <h3 class="text-xl text-pretty mb-2">{{ index }}. {{ title }}</h3>
    <!-- Use a div: marked wraps blocks in <p>, and nested <p> breaks hydration -->
    <div class="prose max-w-none" v-html="parsedContent" />
  </div>
</template>

<script setup lang="ts">
import { marked } from "marked";

const props = defineProps({
  index: Number,
  title: String,
  content: String,
});

const titleId = computed(() =>
  (props.title || "").toLowerCase().replace(/\s/g, "-"),
);

const parsedContent = computed(() => {
  if (!props.content) return "";
  return marked.parse(props.content, { async: false }) as string;
});
</script>
