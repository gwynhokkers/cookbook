<script setup lang="ts">
import type { HumphryRecipeSummary } from '~~/shared/utils/humphryTypes'

defineProps<{
  recipes: HumphryRecipeSummary[]
}>()
</script>

<template>
  <div
    v-if="recipes.length"
    class="mt-2 space-y-2"
  >
    <p class="text-xs font-medium text-muted uppercase tracking-wide">
      Suggested recipes
    </p>
    <div class="grid gap-2 sm:grid-cols-2">
      <NuxtLink
        v-for="recipe in recipes"
        :key="recipe.id"
        :to="`/recipes/${recipe.id}`"
        class="group flex gap-3 rounded-lg border border-default bg-elevated/50 p-3 transition hover:border-biolume-500/40 hover:bg-elevated"
      >
        <div
          v-if="recipe.imageUrl"
          class="size-16 shrink-0 overflow-hidden rounded-md bg-muted"
        >
          <NuxtImg
            :src="recipe.imageUrl"
            :alt="recipe.title"
            class="size-full object-cover"
            width="64"
            height="64"
          />
        </div>
        <div
          v-else
          class="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted"
        >
          <UIcon
            name="i-lucide-utensils"
            class="size-5"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium group-hover:text-biolume-600">
            {{ recipe.title }}
          </p>
          <p
            v-if="recipe.description"
            class="mt-0.5 line-clamp-2 text-sm text-muted"
          >
            {{ recipe.description }}
          </p>
          <div
            v-if="recipe.tags?.length"
            class="mt-1.5 flex flex-wrap gap-1"
          >
            <UBadge
              v-for="tag in recipe.tags.slice(0, 3)"
              :key="tag"
              size="xs"
              color="neutral"
              variant="subtle"
            >
              {{ tag }}
            </UBadge>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
