<script setup lang="ts">
const { header } = useAppConfig()
</script>

<template>
  <UHeader>
    <template #title>
      <template v-if="header?.logo?.dark || header?.logo?.light">
        <UColorModeImage v-bind="{ class: 'h-6 w-auto', ...header?.logo }" />
      </template>
      <template v-else>
        <span>

          Cook<span class="text-green-600">Book</span>
          <!-- <UBadge
            label="Recipes"
            variant="subtle"
            class="mb-0.5"
          /> -->
        </span>
      </template>
    </template>

    <template #default>
      <!-- <UNavigationMenu
        :items="header?.navigation"
        class="w-full justify-center"
      /> -->

      <!-- <UContentSearchButton class="hidden lg:flex" /> -->
    </template>

    <template #right>
      <UContentSearchButton
        :label="null"
      />

      <UColorModeButton v-if="header?.colorMode" />

      <template v-if="header?.links">
        <UButton
          v-for="(link, index) of header.links"
          :key="index"
          v-bind="{ color: 'gray', variant: 'ghost', ...link }"
        />
      </template>
    </template>

    <!-- <template #panel>
      <UNavigationTree :links="mapContentNavigation(navigation)" />
    </template> -->
  </UHeader>
</template>
