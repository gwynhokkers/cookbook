<template>
  <UPage class="container mx-auto flex-col flex gap-4 py-8 px-4">
    <h1 class="text-4xl font-serif text-pretty mb-4">
      {{ page?.title }}
    </h1>
    <!-- <UPageHeader
      class="font-serif !font-normal"
      :title="page.title"
      :ui="{ headline: 'px-0' }"
    /> -->

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
    <UPageBody>
      <ContentRenderer
        v-if="page?.body"
        class="mb-8"
        :value="page"
      />

      <USeparator />

      <UContentSurround :surround="(surround as any)" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
// import { withoutTrailingSlash } from 'ufo'
const { seo } = useAppConfig()

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

const { data: surround } = await useAsyncData(`${route.path}-surround`, () => {
  return queryCollectionItemSurroundings('recipes', route.path, {
    fields: ['description']
  })
})

useSeoMeta({
  title: page?.value.title,
  ogTitle: `${page?.value.title}`,
  ogTitle: `${page?.value.title} - ${seo?.siteName}`,
  description: page?.value.description,
  ogDescription: page?.value.description
})

// defineOgImage({
//   component: 'Recipe',
//   title: page?.value?.title,
//   description: page?.value?.description
// })
defineOgImageComponent('NuxtSeo', {
  title: 'Hello OG Image 👋',
  description: 'Look at me in dark mode',
  theme: '#ff0000',
  colorMode: 'dark'
})

// const headline = computed(() => findPageHeadline(page?.value))

// const links = computed(() => [toc?.bottom?.edit && {
//   icon: 'i-heroicons-pencil-square',
//   label: 'Edit this page',
//   to: `${toc.bottom.edit}/${page?.value?._file}`,
//   target: '_blank'
// }, ...(toc?.bottom?.links || [])].filter(Boolean))
</script>
