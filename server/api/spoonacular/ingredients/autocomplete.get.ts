import { autocompleteIngredientCached } from '../../../utils/spoonacular'

export default cachedEventHandler(
  async (event) => {
    const query = getQuery(event).q as string

    if (!query || query.trim().length < 2) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Search query must be at least 2 characters'
      })
    }

    try {
      const results = await autocompleteIngredientCached(event, query.trim())
      return results
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to search ingredients'
      })
    }
  },
  {
    maxAge: 60 * 60 * 24, // 24 hours
    getKey: (event) => {
      const query = getQuery(event).q as string
      return `spoonacular:autocomplete:${query?.toLowerCase().trim() || ''}`
    }
  }
)
