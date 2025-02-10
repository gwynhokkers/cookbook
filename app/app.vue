<script setup lang="ts">
// import type { ParsedContent } from '@nuxt/content'

const { seo } = useAppConfig()

// const { data: navigation } = await useAsyncData('navigation', () => fetchContentNavigation())
// const { data: files } = useLazyFetch<ParsedContent[]>('/api/search.json', {
//   default: () => [],
//   server: false
// })

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  titleTemplate: `%s - ${seo?.siteName}`,
  ogSiteName: seo?.siteName,
  ogImage: 'https://docs-template.nuxt.dev/social-card.png',
  twitterImage: 'https://docs-template.nuxt.dev/social-card.png',
  twitterCard: 'summary_large_image'
})

// provide('navigation', navigation)

// const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('content'))

// const { data: recipes } = useLazyAsyncData('search-recipes', () => queryCollectionSearchSections('recipes'), {
//   server: false
// })

const { data: recipes } = useLazyAsyncData('search-recipes', () => queryCollectionSearchSections('recipes'), {
  server: false
})

const { data: navigation } = useAsyncData('navigation', () => queryCollectionNavigation('recipes'))
const links = [{
  label: 'Docs',
  icon: 'i-lucide-book',
  to: '/getting-started'
}, {
  label: 'Components',
  icon: 'i-lucide-box',
  to: '/components'
}, {
  label: 'Roadmap',
  icon: 'i-lucide-chart-no-axes-gantt',
  to: '/roadmap'
}]

const searchTerm = ref('')
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <AppHeader />
    <ClientOnly>
      <LazyUContentSearch
        v-model:search-term="searchTerm"
        :files="recipes"
        shortcut="meta_k"
        :fuse="{ resultLimit: 42 }"
        :navigation="navigation"
      />
      <!-- :links="links" -->
    </ClientOnly>
    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <AppFooter />
  </UApp>
</template>
