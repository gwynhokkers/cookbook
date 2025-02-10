<template>
  <div
    :id="titleId"
    class=""
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  title: String
})

const titleId = computed(() => props.title.toLowerCase().replace(/\s/g, '-'))
</script>
