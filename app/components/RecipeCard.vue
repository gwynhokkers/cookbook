<template>
  <UPageCard
    :to="`/recipes/${recipe.id}`"
    :title="recipe.title"
    :description="recipe.description || undefined"
    class="relative"
  >
    <template v-if="recipe.imageUrl" #header>
      <NuxtImg
        class="aspect-square object-cover"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        provider="blob"
      />
    </template>

    <UBadge
      v-if="recipe.visibility === 'private'"
      color="warning"
      class="absolute top-2 left-2 z-10"
    >
      <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
      Private
    </UBadge>

    <RecipeFavoriteButton
      v-if="showFavorite"
      :recipe-id="recipe.id"
      class="absolute top-2 right-2 z-10"
      @update:favorited="emit('favorite-changed')"
    />

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
