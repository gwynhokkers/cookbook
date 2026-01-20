import { parseIngredientsCached } from '../../../utils/spoonacular'

export default cachedEventHandler(
  async (event) => {
    const body = await readBody(event)
    const { ingredients } = body

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Ingredients array is required'
      })
    }

    if (ingredients.length > 50) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Maximum 50 ingredients can be parsed at once'
      })
    }

    try {
      const results = await parseIngredientsCached(event, ingredients)
      return results
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to parse ingredients'
      })
    }
  },
  {
    maxAge: 60 * 60 * 24, // 24 hours
    getKey: (event) => {
      const body = event.body as any
      const ingredients = body?.ingredients || []
      return `spoonacular:parse:${ingredients.sort().join('|').toLowerCase()}`
    }
  }
)
