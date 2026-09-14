<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader :title="copy.title" :description="copy.description" />
    <UPageBody>
      <UButton to="/login">Sign in</UButton>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { unavailableCopy } from '~~/shared/utils/inviteCopy'

const route = useRoute()
const reason = typeof route.query.reason === 'string' ? route.query.reason : null
const copy = unavailableCopy(reason)
</script>
