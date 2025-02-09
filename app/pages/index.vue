<template>
  <UPage>
    <UPageHero title="Cook Book" />

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
// useSeoMeta({
//   titleTemplate: '',
//   title: page.value.title,
//   ogTitle: page.value.title,
//   description: page.value.description,
//   ogDescription: page.value.description
// })
</script>
