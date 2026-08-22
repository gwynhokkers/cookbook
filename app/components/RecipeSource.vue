<template>
  <component
    :is="linkTag"
    v-if="parsed"
    v-bind="linkAttrs"
    class="inline-flex items-start gap-1.5 text-muted"
    :class="size === 'sm' ? 'text-xs' : 'text-sm'"
  >
    <UIcon
      :name="parsed.isUrl ? 'i-lucide-link' : 'i-lucide-book-open'"
      class="mt-0.5 shrink-0"
      :class="size === 'sm' ? 'size-3.5' : 'size-4'"
    />
    <span>
      <template v-if="parsed.book">
        <span class="text-highlighted">{{ parsed.book }}</span>
        <span v-if="parsed.author"> by {{ parsed.author }}</span>
      </template>
      <template v-else>
        {{ parsed.label }}
      </template>
    </span>
  </component>
</template>

<script setup lang="ts">
import { parseRecipeSource } from "~~/shared/utils/formatRecipeSource";

const props = withDefaults(
  defineProps<{
    source?: string | null;
    size?: "sm" | "md";
    linkable?: boolean;
  }>(),
  {
    size: "md",
    linkable: true,
  },
);

const parsed = computed(() => parseRecipeSource(props.source));

const linkTag = computed(() => {
  if (!parsed.value?.href || !props.linkable) return "span";
  return "a";
});

const linkAttrs = computed(() => {
  if (!parsed.value?.href || !props.linkable) return {};
  return {
    href: parsed.value.href,
    target: "_blank",
    rel: "noopener noreferrer",
    class: "hover:text-highlighted transition-colors",
  };
});
</script>
