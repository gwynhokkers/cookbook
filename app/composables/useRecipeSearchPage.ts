import { refDebounced } from '@vueuse/core'
import {
  hasActiveFilters,
  parseRecipeSearchFilters,
  serializeRecipeSearchFilters,
  type RecipeSearchFilters
} from '~~/shared/utils/recipeSearchFilters'
import type { PaginatedRecipeSearchResults } from '~~/shared/utils/recipeSearchTypes'
import { emptyPaginatedSearchResults } from '~~/shared/utils/recipeSearchTypes'

export const SEARCH_PAGE_SIZE = 12

export function useRecipeSearchPage() {
  const route = useRoute()
  const router = useRouter()

  const scope = computed(() => (route.query.scope === 'favorites' ? 'favorites' : 'all'))
  const filters = computed(() => parseRecipeSearchFilters(route.query as Record<string, unknown>))
  const page = computed(() => Math.max(1, Number(route.query.page) || 1))
  const queryInput = ref(String(route.query.q || ''))
  const debouncedQuery = refDebounced(queryInput, 250)

  const effectiveQuery = computed(() => {
    const trimmed = debouncedQuery.value.trim()
    return trimmed.length >= 2 ? trimmed : ''
  })

  function buildQuery(overrides: {
    q?: string
    filters?: RecipeSearchFilters
    page?: number
    scope?: 'all' | 'favorites'
  }) {
    const nextScope = overrides.scope ?? scope.value
    const nextFilters = overrides.filters ?? filters.value
    const nextQ = overrides.q ?? queryInput.value
    const nextPage = overrides.page ?? 1

    const params: Record<string, string> = {
      ...serializeRecipeSearchFilters(nextFilters)
    }
    if (nextScope === 'favorites') params.scope = 'favorites'
    const trimmed = nextQ.trim()
    if (trimmed) params.q = trimmed
    if (nextPage > 1) params.page = String(nextPage)
    return params
  }

  function replaceQuery(overrides: Parameters<typeof buildQuery>[0]) {
    router.replace({ path: '/search', query: buildQuery(overrides) })
  }

  watch(queryInput, (value) => {
    const trimmed = value.trim()
    const currentQ = route.query.q ? String(route.query.q) : ''
    if (currentQ === trimmed) return
    replaceQuery({ q: value, page: 1 })
  })

  watch(() => route.query.q, (value) => {
    const next = String(value || '')
    if (next !== queryInput.value) {
      queryInput.value = next
    }
  })

  const fetchKey = computed(() => [
    scope.value,
    page.value,
    effectiveQuery.value,
    JSON.stringify(filters.value)
  ].join('|'))

  const { data, pending } = useAsyncData(
    () => `recipe-search-${fetchKey.value}`,
    () => $fetch<PaginatedRecipeSearchResults>('/api/recipes/search', {
      query: {
        ...serializeRecipeSearchFilters(filters.value),
        q: effectiveQuery.value || undefined,
        page: page.value,
        limit: SEARCH_PAGE_SIZE,
        scope: scope.value
      }
    }),
    {
      watch: [scope, page, effectiveQuery, filters],
      default: () => emptyPaginatedSearchResults(SEARCH_PAGE_SIZE)
    }
  )

  const items = computed(() => data.value?.items || [])
  const total = computed(() => data.value?.total || 0)
  const totalPages = computed(() => data.value?.totalPages || 0)

  function pageLink(nextPage: number) {
    const query = buildQuery({ page: nextPage })
    if (nextPage <= 1) delete query.page
    return { path: '/search', query }
  }

  function clearAll() {
    queryInput.value = ''
    replaceQuery({
      q: '',
      filters: { tags: [], sources: [], diet: [], time: null },
      page: 1
    })
  }

  return {
    scope,
    filters,
    page,
    queryInput,
    effectiveQuery,
    hasActiveFilters: computed(() => hasActiveFilters(filters.value) || effectiveQuery.value.length >= 2),
    data,
    pending,
    items,
    total,
    totalPages,
    replaceQuery,
    pageLink,
    clearAll,
    SEARCH_PAGE_SIZE
  }
}
