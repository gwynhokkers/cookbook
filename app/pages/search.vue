<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Search recipes"
      description="Find recipes by title, ingredient, tag, book, or method."
    />

    <UPageBody>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search recipes..."
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

      <div v-else-if="query.trim().length >= 2 && results.length === 0" class="mt-8 text-sm text-muted">
        No recipes found for "{{ query.trim() }}".
      </div>

      <div v-else-if="(results || []).length" class="mt-8 space-y-4">
        <p class="text-sm text-muted">
          {{ (results || []).length }} result{{ (results || []).length === 1 ? '' : 's' }}
        </p>

        <UPageCard
          v-for="recipe in results || []"
          :key="recipe.id"
          :to="`/recipes/${recipe.id}`"
          :title="recipe.title"
          :description="recipe.snippet || recipe.description || undefined"
          variant="subtle"
        >
          <template v-if="recipe.imageUrl" #header>
            <NuxtImg
              class="aspect-video object-cover"
              :src="recipe.imageUrl"
              :alt="recipe.title"
              provider="blob"
            />
          </template>

          <template #footer>
            <div class="space-y-2">
              <p v-if="recipe.matchedOn.length" class="text-xs text-muted">
                Matched: {{ formatSearchMatches(recipe.matchedOn) }}
              </p>
              <RecipeSource
                v-if="recipe.source"
                :source="recipe.source"
                size="sm"
                :linkable="false"
              />
            </div>
          </template>
        </UPageCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import type { RecipeSearchResult } from '~~/shared/utils/recipeSearchTypes'
import { formatSearchMatches } from '~~/shared/utils/recipeSearchTypes'

const route = useRoute()
const router = useRouter()

const query = ref(String(route.query.q || ''))
const debouncedQuery = refDebounced(query, 250)

watch(query, (value) => {
  const trimmed = value.trim()
  router.replace({
    query: trimmed ? { q: trimmed } : {}
  })
})

watch(() => route.query.q, (value) => {
  const next = String(value || '')
  if (next !== query.value) {
    query.value = next
  }
})

const { data: results, pending } = await useAsyncData(
  'recipe-search-page',
  () => {
    const q = debouncedQuery.value.trim()
    if (q.length < 2) {
      return Promise.resolve([] as RecipeSearchResult[])
    }

    return $fetch<RecipeSearchResult[]>('/api/recipes/search', {
      query: { q, limit: 50 }
    })
  },
  {
    watch: [debouncedQuery],
    default: () => [] as RecipeSearchResult[]
  }
)

useSeoMeta({
  title: 'Search recipes',
  robots: 'noindex, nofollow'
})
</script>
