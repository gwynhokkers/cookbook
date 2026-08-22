<script setup lang="ts">
import { createRecipe } from '~~/shared/utils/abilities'

const { header } = useAppConfig()
const { open: searchOpen } = useAppSearch()
const menuOpen = ref(false)

function openSearch() {
  menuOpen.value = false
  searchOpen.value = true
}
</script>

<template>
  <UHeader v-model:open="menuOpen">
    <template #title>
      <template v-if="header?.logo?.dark || header?.logo?.light">
        <UColorModeImage v-bind="{ class: 'h-6 w-auto', ...header?.logo }" />
      </template>
      <template v-else>
        <NuxtLink to="/" class="font-serif text-base sm:text-lg">
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
        class="hidden md:inline-flex"
        @click="openSearch"
      />
    </template>

    <template #right>
      <div class="hidden md:flex items-center gap-1">
        <AuthButton />
        <UColorModeButton v-if="header?.colorMode" class="cursor-pointer" />
        <template v-if="header?.links">
          <UButton
            v-for="(link, index) of header.links"
            :key="index"
            v-bind="{ color: 'gray', variant: 'ghost', ...link }"
          />
        </template>
      </div>

      <UButton
        icon="i-lucide-search"
        variant="ghost"
        color="neutral"
        aria-label="Search recipes"
        class="md:hidden"
        @click="openSearch"
      />
    </template>

    <template #body>
      <nav class="flex flex-col gap-1 p-4">
        <UButton
          block
          icon="i-lucide-search"
          variant="soft"
          color="neutral"
          @click="openSearch"
        >
          Search recipes
        </UButton>
        <UButton
          block
          icon="i-lucide-home"
          variant="ghost"
          color="neutral"
          to="/"
        >
          Home
        </UButton>
        <Can :ability="createRecipe">
          <UButton
            block
            icon="i-heroicons-plus"
            variant="ghost"
            color="neutral"
            to="/recipes/new"
          >
            Create recipe
          </UButton>
        </Can>
        <div class="my-2 border-t border-default" />
        <div class="px-1">
          <AuthButton />
        </div>
        <UColorModeButton
          v-if="header?.colorMode"
          block
          variant="ghost"
          color="neutral"
          class="justify-start"
        />
        <template v-if="header?.links">
          <UButton
            v-for="(link, index) of header.links"
            :key="`mobile-${index}`"
            block
            variant="ghost"
            color="neutral"
            v-bind="link"
          />
        </template>
      </nav>
    </template>
  </UHeader>
</template>
