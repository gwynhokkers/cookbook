import { refDebounced } from '@vueuse/core'
import type { RecipeSearchResult } from '~~/shared/utils/recipeSearchTypes'

export function useRecipeSearchQuery(searchTerm: Ref<string>) {
  const debouncedTerm = refDebounced(searchTerm, 200)
  const loading = ref(false)
  const results = ref<RecipeSearchResult[]>([])

  watch(debouncedTerm, async (term) => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      results.value = []
      loading.value = false
      return
    }

    loading.value = true
    try {
      results.value = await $fetch<RecipeSearchResult[]>('/api/recipes/search', {
        query: { q: trimmed }
      })
    } catch {
      results.value = []
    } finally {
      loading.value = false
    }
  }, { immediate: true })

  const groups = computed(() => {
    if (debouncedTerm.value.trim().length < 2) {
      return []
    }

    return [{
      id: 'recipes',
      label: 'Recipes',
      ignoreFilter: true,
      items: results.value.map((recipe) => ({
        label: recipe.title,
        description: recipe.snippet || recipe.description || undefined,
        icon: 'i-lucide-chef-hat',
        to: `/recipes/${recipe.id}`
      }))
    }]
  })

  return {
    debouncedTerm,
    loading,
    results,
    groups
  }
}
