<template>
  <UPage>
    <UPageHero description="" color="neutral">
      <template #title>
        <span class="font-serif">
          Humboldt <span class="text-biolume-600">Kitchen</span>
          <!-- <UBadge
            label="Recipes"
            variant="subtle"
            class="mb-0.5"
          /> -->
        </span>
      </template>
      <template #description>
        <p class="">A collection of recipes by Inky the Squid</p>
      </template>
    </UPageHero>

    <UPageBody>
      <UPageSection>
        <Can :ability="createRecipe" as="div" class="mb-6">
          <UButton icon="i-heroicons-plus" to="/recipes/new">
            Create New Recipe
          </UButton>
        </Can>
        <UPageGrid>
          <UPageCard
            v-for="recipe in recipes"
            :key="recipe.id"
            :to="`/recipes/${recipe.id}`"
            :title="recipe.title"
            :description="recipe.description"
          >
            <template #header>
              <div class="relative">
                <NuxtImg
                  v-if="recipe?.imageUrl"
                  class="aspect-square object-cover"
                  :src="recipe.imageUrl"
                  :alt="recipe.title"
                  provider="blob"
                />
                <UBadge
                  v-if="recipe.visibility === 'private'"
                  color="warning"
                  class="absolute top-2 right-2"
                >
                  <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
                  Private
                </UBadge>
              </div>
            </template>
          </UPageCard>
        </UPageGrid>
      </UPageSection>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { createRecipe } from "~~/shared/utils/abilities";

const { data: recipes } = await useFetch("/api/recipes");

useSeoMeta({
  title: "Humboldt Kitchen - A collection of recipes by Inky the Squid",
  ogTitle: "Humboldt Kitchen - A collection of recipes by Inky the Squid",
});
</script>
