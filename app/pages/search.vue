<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      :title="isFavoritesScope ? 'Search your favourites' : 'Browse & search recipes'"
      :description="isFavoritesScope
        ? 'Filter and search within your favourites.'
        : 'Browse recent recipes or filter by tag, source, diet, and time.'"
    />

    <UPageBody>
      <div class="flex flex-col gap-6 lg:flex-row">
        <aside class="hidden w-64 shrink-0 lg:block">
          <RecipeSearchFilters
            :filters="filters"
            @update:filters="(f) => replaceQuery({ filters: f, page: 1 })"
          />
        </aside>

        <div class="min-w-0 flex-1 space-y-4">
          <div class="flex flex-wrap gap-2">
            <UButton
              :variant="isFavoritesScope ? 'outline' : 'solid'"
              color="neutral"
              @click="setScope('all')"
            >
              All recipes
            </UButton>
            <UButton
              :variant="isFavoritesScope ? 'solid' : 'outline'"
              color="neutral"
              @click="setScope('favorites')"
            >
              Favourites
            </UButton>
            <UButton
              class="lg:hidden"
              icon="i-lucide-sliders-horizontal"
              variant="outline"
              color="neutral"
              @click="filtersOpen = true"
            >
              Filters
            </UButton>
          </div>

          <UInput
            v-model="queryInput"
            icon="i-lucide-search"
            :placeholder="isFavoritesScope ? 'Search your favourites...' : 'Search recipes...'"
            size="lg"
            autofocus
          />

          <p
            v-if="queryInput.trim().length === 1"
            class="text-sm text-muted"
          >
            Type at least 2 characters to search. Showing filtered or recent results below.
          </p>

          <div v-if="activeChips.length" class="flex flex-wrap items-center gap-2">
            <UBadge
              v-for="chip in activeChips"
              :key="chip.key"
              color="neutral"
              variant="subtle"
              class="inline-flex items-center gap-1"
            >
              {{ chip.label }}
              <UButton
                icon="i-heroicons-x-mark"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="chip.remove()"
              />
            </UBadge>
            <UButton
              variant="link"
              color="neutral"
              size="sm"
              @click="clearAll"
            >
              Clear all
            </UButton>
          </div>

          <div v-if="pending" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
            Loading...
          </div>

          <p v-else-if="error" class="text-sm text-muted">
            Search failed. Try again, or browse with filters.
          </p>

          <template v-else>
            <p class="text-sm text-muted">
              {{ total }} result{{ total === 1 ? '' : 's' }}
              <span v-if="totalPages > 1"> · Page {{ page }} of {{ totalPages }}</span>
            </p>

            <div v-if="items.length === 0" class="text-sm text-muted">
              {{ emptyMessage }}
            </div>

            <UPageGrid v-else>
              <div
                v-for="recipe in items"
                :key="recipe.id"
                class="space-y-1"
              >
                <RecipeCard
                  :recipe="recipe"
                  :show-favorite="true"
                />
                <p
                  v-if="recipe.matchedOn?.length && effectiveQuery"
                  class="text-xs text-muted"
                >
                  Matched: {{ formatSearchMatches(recipe.matchedOn) }}
                </p>
              </div>
            </UPageGrid>

            <div v-if="totalPages > 1" class="mt-6 flex justify-center">
              <UPagination
                :page="page"
                :items-per-page="SEARCH_PAGE_SIZE"
                :total="total"
                :to="pageLink"
              />
            </div>
          </template>
        </div>
      </div>
    </UPageBody>

    <USlideover v-model:open="filtersOpen" title="Filters">
      <template #body>
        <RecipeSearchFilters
          :filters="filters"
          @update:filters="(f) => replaceQuery({ filters: f, page: 1 })"
        />
      </template>
    </USlideover>
  </UPage>
</template>

<script setup lang="ts">
import { formatSearchMatches } from '~~/shared/utils/recipeSearchTypes'
import { useRecipeSearchPage } from '~/composables/useRecipeSearchPage'

const route = useRoute()
const { loggedIn } = useUserSession()

const isFavoritesScope = computed(() => scope.value === 'favorites')

if (route.query.scope === 'favorites' && !loggedIn.value) {
  await navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
}

const filtersOpen = ref(false)

const {
  scope,
  filters,
  page,
  queryInput,
  effectiveQuery,
  pending,
  error,
  items,
  total,
  totalPages,
  replaceQuery,
  pageLink,
  clearAll,
  SEARCH_PAGE_SIZE
} = useRecipeSearchPage()

function setScope(nextScope: 'all' | 'favorites') {
  if (nextScope === 'favorites' && !loggedIn.value) {
    navigateTo(`/login?redirect=${encodeURIComponent('/search?scope=favorites')}`)
    return
  }
  replaceQuery({ scope: nextScope, page: 1 })
}

const activeChips = computed(() => {
  const chips: Array<{ key: string, label: string, remove: () => void }> = []

  for (const tag of filters.value.tags) {
    chips.push({
      key: `tag-${tag}`,
      label: tag,
      remove: () => replaceQuery({
        filters: { ...filters.value, tags: filters.value.tags.filter((t) => t !== tag) },
        page: 1
      })
    })
  }

  for (const source of filters.value.sources) {
    chips.push({
      key: `source-${source}`,
      label: source,
      remove: () => replaceQuery({
        filters: { ...filters.value, sources: filters.value.sources.filter((s) => s !== source) },
        page: 1
      })
    })
  }

  for (const diet of filters.value.diet) {
    chips.push({
      key: `diet-${diet}`,
      label: diet,
      remove: () => replaceQuery({
        filters: { ...filters.value, diet: filters.value.diet.filter((d) => d !== diet) },
        page: 1
      })
    })
  }

  if (filters.value.time) {
    const timeLabels: Record<string, string> = {
      'under-30': 'Under 30 min',
      '30-60': '30–60 min',
      'over-60': 'Over 60 min'
    }
    chips.push({
      key: `time-${filters.value.time}`,
      label: timeLabels[filters.value.time] || filters.value.time,
      remove: () => replaceQuery({
        filters: { ...filters.value, time: null },
        page: 1
      })
    })
  }

  return chips
})

const emptyMessage = computed(() => {
  if (isFavoritesScope.value) {
    return effectiveQuery.value
      ? `No favourites match "${effectiveQuery.value}".`
      : 'No favourites match your filters.'
  }
  if (effectiveQuery.value) {
    return `No recipes found for "${effectiveQuery.value}".`
  }
  if (activeChips.value.length) {
    return 'No recipes match these filters.'
  }
  return 'No recipes yet.'
})

useSeoMeta({
  title: isFavoritesScope.value ? 'Search your favourites' : 'Browse & search recipes',
  robots: 'noindex, nofollow'
})
</script>
