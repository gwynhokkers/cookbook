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
        <UPageGrid>
          <UPageCard
            v-for="(recipe, index) in recipes"
            :key="index"
            :to="recipe.path"
            v-bind="recipe"
          >
            <template #header>
              <NuxtImg
                v-if="recipe?.image"
                class="aspect-square object-cover"
                :src="'img/recipes/' + recipe.image"
              />
            </template>
          </UPageCard>
        </UPageGrid>
      </UPageSection>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
// const { data: page } = await useAsyncData('index', () => queryContent('/').findOne())
const { data: recipes } = await useAsyncData('recipes', () => {
  return queryCollection('recipes')
    .order('date', 'DESC')
    .select('title', 'path', 'description', 'image')
    .all()
})

useSeoMeta({
  title: 'CookBook - A collection of recipes by Meg & Gwyn',
  ogTitle: 'CookBook - A collection of recipes by Meg & Gwyn'
//   description: page?.value.description,
//   ogDescription: page?.value.description
})
</script>
