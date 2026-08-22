<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      :title="isFavoritesScope ? 'Search your favourites' : 'Search recipes'"
      :description="isFavoritesScope
        ? 'Find recipes within your favourites by title, ingredient, tag, book, or method.'
        : 'Find recipes by title, ingredient, tag, book, or method.'"
    />

    <UPageBody>
      <div class="mb-4 flex flex-wrap gap-2">
        <UButton
          :variant="isFavoritesScope ? 'outline' : 'solid'"
          color="neutral"
          :to="{ path: '/search', query: query.trim() ? { q: query.trim() } : {} }"
        >
          All recipes
        </UButton>
        <UButton
          :variant="isFavoritesScope ? 'solid' : 'outline'"
          color="neutral"
          :to="{ path: '/search', query: { scope: 'favorites', ...(query.trim() ? { q: query.trim() } : {}) } }"
        >
          Favourites
        </UButton>
      </div>

      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="isFavoritesScope ? 'Search your favourites...' : 'Search recipes...'"
        size="lg"
        autofocus
        class="max-w-2xl"
      />

      <p v-if="query.trim().length > 0 && query.trim().length < 2" class="mt-4 text-sm text-muted">
        Type at least 2 characters to search.
      </p>

      <div v-else-if="pending" class="mt-8 flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
        Searching...
      </div>

      <div v-else-if="query.trim().length >= 2 && (results || []).length === 0" class="mt-8 text-sm text-muted">
        {{ isFavoritesScope
          ? `No favourites match "${query.trim()}".`
          : `No recipes found for "${query.trim()}".` }}
      </div>

      <div v-else-if="(results || []).length" class="mt-8 space-y-4">
        <p class="text-sm text-muted">
          {{ (results || []).length }} result{{ (results || []).length === 1 ? '' : 's' }}
        </p>

        <UPageGrid>
          <RecipeCard
            v-for="recipe in results || []"
            :key="recipe.id"
            :recipe="recipe"
            :show-favorite="true"
          />
        </UPageGrid>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { RecipeSearchResult } from '~~/shared/utils/recipeSearchTypes'

const route = useRoute()
const router = useRouter()
const { loggedIn } = useUserSession()

const scope = computed(() => String(route.query.scope || 'all'))
const isFavoritesScope = computed(() => scope.value === 'favorites')

if (isFavoritesScope.value && !loggedIn.value) {
  await navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
}

const query = ref(String(route.query.q || ''))
const debouncedQuery = refDebounced(query, 250)

watch([query, scope], () => {
  const trimmed = query.value.trim()
  const nextQuery: Record<string, string> = {}

  if (isFavoritesScope.value) {
    nextQuery.scope = 'favorites'
  }
  if (trimmed) {
    nextQuery.q = trimmed
  }

  router.replace({ query: nextQuery })
})

watch(() => route.query.q, (value) => {
  const next = String(value || '')
  if (next !== query.value) {
    query.value = next
  }
})

const { data: results, pending } = await useAsyncData(
  () => `recipe-search-page-${scope.value}`,
  () => {
    const q = debouncedQuery.value.trim()
    if (q.length < 2) {
      return Promise.resolve([] as RecipeSearchResult[])
    }

    return $fetch<RecipeSearchResult[]>('/api/recipes/search', {
      query: {
        q,
        limit: 50,
        scope: isFavoritesScope.value ? 'favorites' : 'all'
      }
    })
  },
  {
    watch: [debouncedQuery, scope],
    default: () => [] as RecipeSearchResult[]
  }
)

useSeoMeta({
  title: isFavoritesScope.value ? 'Search your favourites' : 'Search recipes',
  robots: 'noindex, nofollow'
})
</script>
