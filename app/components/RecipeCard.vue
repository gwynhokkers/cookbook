<template>
  <UPageCard
    :to="`/recipes/${recipe.id}`"
    :title="recipe.imageUrl ? recipe.title : undefined"
    :description="recipe.imageUrl ? (recipe.description || undefined) : undefined"
    class="relative overflow-hidden"
  >
    <template v-if="recipe.imageUrl" #header>
      <div class="relative">
        <NuxtImg
          class="aspect-square w-full object-cover"
          :src="recipe.imageUrl"
          :alt="recipe.title"
          provider="blob"
        />
        <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-1 p-2">
          <UBadge
            v-if="recipe.visibility === 'private'"
            color="warning"
            class="pointer-events-auto max-w-[calc(100%-2.75rem)] shrink truncate"
          >
            <UIcon name="i-heroicons-lock-closed" class="size-3 shrink-0" />
            <span class="sr-only sm:not-sr-only sm:ml-1">Private</span>
          </UBadge>
          <RecipeFavoriteButton
            v-if="showFavorite"
            :recipe-id="recipe.id"
            class="pointer-events-auto ml-auto shrink-0"
            @update:favorited="emit('favorite-changed')"
          />
        </div>
      </div>
    </template>

    <template v-if="!recipe.imageUrl" #body>
      <div
        v-if="recipe.visibility === 'private' || showFavorite"
        class="mb-2 flex items-start justify-between gap-2"
      >
        <UBadge
          v-if="recipe.visibility === 'private'"
          color="warning"
          class="shrink-0"
        >
          <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
          Private
        </UBadge>
        <RecipeFavoriteButton
          v-if="showFavorite"
          :recipe-id="recipe.id"
          class="ml-auto shrink-0"
          @update:favorited="emit('favorite-changed')"
        />
      </div>

      <div class="text-base font-semibold text-highlighted">
        {{ recipe.title }}
      </div>
      <div
        v-if="recipe.description"
        class="mt-1 text-sm text-muted"
      >
        {{ recipe.description }}
      </div>
    </template>

    <template v-if="recipe.source" #footer>
      <RecipeSource
        :source="recipe.source"
        size="sm"
        :linkable="false"
      />
    </template>
  </UPageCard>
</template>

<script setup lang="ts">
import type { RecipeSummary } from '~~/shared/utils/recipeListTypes'

withDefaults(defineProps<{
  recipe: RecipeSummary
  showFavorite?: boolean
}>(), {
  showFavorite: true
})

const emit = defineEmits<{
  'favorite-changed': []
}>()
</script>
