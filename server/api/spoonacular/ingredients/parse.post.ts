import { parseIngredientsCached } from '../../../utils/spoonacular'

/**
 * Parse natural-language ingredient lines (e.g. "1 lemon, juiced") via Spoonacular.
 *
 * NOTE: this must be a plain `defineEventHandler`. A `cachedEventHandler` wrapper does
 * not preserve the POST request body across Nitro's cache layer, so `readBody` returns
 * `undefined`. Response caching is still handled by `parseIngredientsCached`
 * (a `defineCachedFunction` keyed on the ingredient strings).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ingredients = body?.ingredients

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

  const normalized = ingredients
    .map((value: unknown) => String(value ?? '').trim())
    .filter((value: string) => value.length > 0)

  if (normalized.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ingredients array is required'
    })
  }

  try {
    return await parseIngredientsCached(event, normalized)
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to parse ingredients'
    })
  }
})
