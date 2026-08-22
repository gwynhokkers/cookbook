<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

useSeoMeta({
  title: 'Humphry — Humboldt Kitchen',
  ogTitle: 'Humphry — Humboldt Kitchen',
  description: 'Ask Humphry for recipe suggestions from the Humboldt Kitchen collection.'
})
</script>

<template>
  <UPage>
    <UPageHero
      title="Humphry"
      description="Your Humboldt Kitchen sous-chef — ask what to cook from the collection."
      color="neutral"
    />

    <UPageBody>
      <UPageSection class="mx-auto w-full max-w-4xl">
        <HumphryChatPanel />
      </UPageSection>
    </UPageBody>
  </UPage>
</template>
