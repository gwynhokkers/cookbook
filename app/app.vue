<script setup lang="ts">
import { seoDefaults } from '~/config/seo'

const { seo } = useAppConfig()
const siteName = seo?.siteName || seoDefaults.siteName

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', media: '(prefers-color-scheme: light)' },
    { rel: 'icon', type: 'image/svg+xml', href: '/inky-chef-white.svg', media: '(prefers-color-scheme: dark)' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'shortcut icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  titleTemplate: (title) => {
    if (!title || title === siteName || title.includes(siteName)) {
      return title || siteName
    }
    return `${title} · ${siteName}`
  }
})

useSeoMeta({
  ogSiteName: siteName,
  twitterCard: 'summary_large_image'
})

useSchemaOrg([
  defineWebSite({
    name: seoDefaults.siteName,
    description: seoDefaults.description,
    author: definePerson({
      name: seoDefaults.authorName,
      url: seoDefaults.authorUrl
    })
  })
])

defineOgImage('Kitchen.takumi', {
  eyebrow: seoDefaults.authorName,
  title: seoDefaults.siteName,
  description: seoDefaults.description
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <AppHeader />

    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>

    <AppFooter />

    <HumphryFab />
  </UApp>
</template>
