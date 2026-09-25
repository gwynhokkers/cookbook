<template>
  <component
    :is="linkTag"
    v-if="parsed"
    v-bind="linkAttrs"
    class="inline-flex items-start gap-1.5 text-muted"
    :class="size === 'sm' ? 'text-xs' : 'text-sm'"
  >
    <UIcon
      :name="iconName"
      class="mt-0.5 shrink-0"
      :class="size === 'sm' ? 'size-3.5' : 'size-4'"
    />
    <span :class="sourceUrl && linkable ? 'underline-offset-2 hover:underline' : undefined">
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
    sourceUrl?: string | null;
    size?: "sm" | "md";
    linkable?: boolean;
  }>(),
  {
    size: "md",
    linkable: true,
  },
);

const parsed = computed(() => parseRecipeSource(props.source));

const iconName = computed(() => {
  if (props.sourceUrl) return "i-lucide-external-link";
  if (parsed.value?.isUrl) return "i-lucide-link";
  return "i-lucide-book-open";
});

const linkTag = computed(() => {
  if (!props.sourceUrl || !props.linkable) return "span";
  return "a";
});

const linkAttrs = computed(() => {
  if (!props.sourceUrl || !props.linkable) return {};
  return {
    href: props.sourceUrl,
    target: "_blank",
    rel: "noopener noreferrer",
    class: "hover:text-highlighted transition-colors",
  };
});
</script>
