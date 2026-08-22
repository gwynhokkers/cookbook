<script setup lang="ts">
const { header } = useAppConfig()
const { open: searchOpen } = useAppSearch()
</script>

<template>
  <UHeader>
    <template #title>
      <template v-if="header?.logo?.dark || header?.logo?.light">
        <UColorModeImage v-bind="{ class: 'h-6 w-auto', ...header?.logo }" />
      </template>
      <template v-else>
        <NuxtLink to="/" class="font-serif">
          Humboldt <span class="text-biolume-600">Kitchen</span>
        </NuxtLink>
      </template>
    </template>

    <template #default>
      <UButton
        icon="i-lucide-search"
        label="Search"
        variant="outline"
        color="neutral"
        class="hidden sm:inline-flex"
        @click="searchOpen = true"
      />
    </template>

    <template #right>
      <UButton
        to="/search"
        icon="i-lucide-search"
        variant="ghost"
        color="neutral"
        aria-label="Search recipes"
        class="sm:hidden"
      />

      <AuthButton />

      <UColorModeButton v-if="header?.colorMode" class="cursor-pointer" />

      <template v-if="header?.links">
        <UButton
          v-for="(link, index) of header.links"
          :key="index"
          v-bind="{ color: 'gray', variant: 'ghost', ...link }"
        />
      </template>
    </template>
  </UHeader>
</template>
