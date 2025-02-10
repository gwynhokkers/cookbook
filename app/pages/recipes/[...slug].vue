<template>
  <UPage class="container mx-auto flex-col flex gap-4 py-8 px-4">
    <template #left>
      <UPageAside>
        <div class="">
          <UContentToc
            title="On this page"
            :links="links"
            highlight
            highlight-color="neutral"
            color="neutral"
          />
        </div>
        <UContentNavigation :navigation="navigation" />
      </UPageAside>
    </template>
    <h1 class="text-4xl font-serif text-pretty mb-4">
      {{ page?.title }}
    </h1>
    <!-- <UPageHeader
      class="font-serif !font-normal"
      :title="page.title"
      :ui="{ headline: 'px-0' }"
    /> -->
    <div class="mb-4">
      <NuxtPicture
        v-if="page?.image"
        :src="'img/recipes/' + page?.image"
        :alt="page?.title"
        :img-attrs="{ class: 'w-full rounded-lg overflow-hidden mb-4' }"
        width="800"
        height="600"
      />
      <div class="flex justify-between">
        <div class="flex gap-2 mb-2">
          <UBadge
            v-for="(item, index) in page.tags"
            :key="index"
            color="primary"
            class="rounded-full"
          >
            {{ item }}
          </UBadge>
        </div>
        <div class="">
          <UButton
            v-if="page?.source"
            icon="i-lucide-link"
            variant="ghost"
            :to="page.source"
            target="_blank"
          />
        </div>
      </div>
    </div>
    <USeparator />
    <UPageBody>
      <ContentRenderer
        v-if="page?.body"
        class="mb-8 max-w-4xl"
        :value="page"
      />

      <USeparator />

      <UContentSurround :surround="(surround as any)" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui-pro/runtime/components/content/ContentToc.vue'

const { seo } = useAppConfig()

const { data: navigation } = await useAsyncData('navigation', () => {
  return queryCollectionNavigation('recipes')
    // .where('published', '=', true)
    .order('date', 'DESC')
})

definePageMeta({
  layout: 'recipes'
})

const route = useRoute()
const { data: page } = await useAsyncData(route.path, () => {
  return queryCollection('recipes').path(route.path).first()
})

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Recipe not found.', fatal: true })
}

const steps = page.value.body.value?.filter(item => item[0] === 'recipe-step')

const links = computed(() => [
  {
    id: 'ingredients',
    depth: 1,
    text: 'Ingredients'
  },
  {
    id: steps?.[0]?.[1]?.title.toLowerCase().replace(/\s/g, '-') || 'step-' + 0,
    depth: 2,
    text: 'Steps',
    children: [
      ...steps.map((step, index) => ({
        id: step?.[1]?.title.toLowerCase().replace(/\s/g, '-') || 'step-' + index,
        depth: 3,
        text: step?.[1]?.title || index
      }))
    ] as ContentTocLink[]
  }
])

// get the ingredients component from page.value
// const ingredients = {
//   ...page.value,
//   body: {
//     value: page.value?.body.value?.find(item => item[0] === 'recipe-ingredient-list')
//   }
// }

const { data: surround } = await useAsyncData(`${route.path}-surround`, () => {
  return queryCollectionItemSurroundings('recipes', route.path, {
    fields: ['description']
  })
})

useSeoMeta({
  title: page?.value.title,
  ogTitle: `${page?.value.title} - ${seo?.siteName}`,
  description: page?.value.description,
  ogDescription: page?.value.description
})

defineOgImage({
  component: 'Recipe',
  title: page?.value?.title,
  description: page?.value?.description
})
// defineOgImageComponent('NuxtSeo', {
//   title: 'Hello OG Image 👋',
//   description: 'Look at me in dark mode',
//   theme: '#ff0000',
//   colorMode: 'dark'
// })
</script>
