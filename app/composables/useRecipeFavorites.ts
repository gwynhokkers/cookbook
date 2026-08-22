export function useRecipeFavorites() {
  const { loggedIn } = useUserSession()
  const favoriteIds = useState<string[]>('recipe-favorite-ids', () => [])

  async function refreshFavoriteIds() {
    if (!loggedIn.value) {
      favoriteIds.value = []
      return
    }

    try {
      const data = await $fetch<{ ids: string[] }>('/api/recipes/favorite-ids')
      favoriteIds.value = data.ids
    } catch {
      favoriteIds.value = []
    }
  }

  if (import.meta.client) {
    watch(loggedIn, () => {
      refreshFavoriteIds()
    }, { immediate: true })
  }

  function isFavorite(recipeId: string) {
    return favoriteIds.value.includes(recipeId)
  }

  async function toggleFavorite(recipeId: string) {
    const currentlyFavorite = isFavorite(recipeId)

    if (currentlyFavorite) {
      await $fetch(`/api/recipes/${recipeId}/favorite`, { method: 'DELETE' })
      favoriteIds.value = favoriteIds.value.filter((id) => id !== recipeId)
      return false
    }

    await $fetch(`/api/recipes/${recipeId}/favorite`, { method: 'POST' })
    favoriteIds.value = [...favoriteIds.value, recipeId]
    return true
  }

  return {
    favoriteIds,
    refreshFavoriteIds,
    isFavorite,
    toggleFavorite
  }
}
