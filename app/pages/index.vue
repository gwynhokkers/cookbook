<template>
  <UPage>
    <UPageHero
      class="font-serif"
      description=""
      color="neutral"
    >
      <template #title>
        <span class="font-serif">
          Cook<span class="text-green-600">Book</span>
          <!-- <UBadge
            label="Recipes"
            variant="subtle"
            class="mb-0.5"
          /> -->
        </span>
      </template>
      <template #description>
        <p class="font-semibold">
          A collection of recipes by Meg & Gwyn
        </p>
      </template>
    </UPageHero>

    <UPageBody>
      <UPageSection>
        <div v-if="isEditor" class="mb-6">
          <UButton
            icon="i-heroicons-plus"
            to="/recipes/new"
          >
            Create New Recipe
          </UButton>
        </div>
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
const { data: recipes } = await useFetch('/api/recipes')

const { loggedIn } = useUserSession()
const { isEditor } = useUserRole()

useSeoMeta({
  title: 'CookBook - A collection of recipes by Meg & Gwyn',
  ogTitle: 'CookBook - A collection of recipes by Meg & Gwyn'
})
</script>
