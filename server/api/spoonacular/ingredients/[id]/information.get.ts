import { getIngredientInfoCached } from '../../../../utils/spoonacular'

export default cachedEventHandler(
  async (event) => {
    const id = getRouterParam(event, 'id')
    const ingredientId = Number(id)

    if (!id || isNaN(ingredientId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid ingredient ID is required'
      })
    }

    try {
      const ingredient = await getIngredientInfoCached(event, ingredientId)
      return ingredient
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch ingredient information'
      })
    }
  },
  {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    getKey: (event) => {
      const id = getRouterParam(event, 'id')
      return `spoonacular:ingredient:${id || ''}`
    }
  }
)
