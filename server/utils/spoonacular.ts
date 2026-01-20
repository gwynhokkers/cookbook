/**
 * Spoonacular API utility
 * Handles API calls with rate limiting, caching, and error handling
 */

const SPOONACULAR_API_BASE = 'https://api.spoonacular.com'

export interface SpoonacularIngredient {
  id: number
  name: string
  image?: string
  aisle?: string
  consistency?: string
  [key: string]: any
}

export interface SpoonacularIngredientInfo {
  id: number
  name: string
  image?: string
  aisle?: string
  consistency?: string
  nutrition?: {
    nutrients: Array<{
      name: string
      amount: number
      unit: string
      percentOfDailyNeeds?: number
    }>
  }
  [key: string]: any
}

export interface ParsedIngredient {
  id: number
  name: string
  original: string
  originalName: string
  amount: number
  unit: string
  unitLong: string
  unitShort: string
  aisle?: string
  image?: string
  meta?: string[]
  nutrition?: {
    nutrients: Array<{
      name: string
      amount: number
      unit: string
      percentOfDailyNeeds?: number
    }>
  }
  [key: string]: any
}

/**
 * Get API key from runtime config
 */
function getApiKey(event: any): string {
  const config = useRuntimeConfig(event)
  const apiKey = config.spoonacular?.apiKey || process.env.SPOON_API_KEY
  
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Spoonacular API key not configured'
    })
  }
  
  return apiKey
}

/**
 * Autocomplete ingredient search
 * Uses cached function for performance
 */
export const autocompleteIngredientCached = defineCachedFunction(
  async (event: any, query: string) => {
    const apiKey = getApiKey(event)
    const url = `${SPOONACULAR_API_BASE}/food/ingredients/autocomplete?query=${encodeURIComponent(query)}&number=10&metaInformation=true`
    
    try {
      const response = await fetch(url, {
        headers: {
          'x-api-key': apiKey
        }
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw createError({
            statusCode: 429,
            statusMessage: 'Rate limit exceeded. Please try again later.'
          })
        }
        if (response.status === 402) {
          throw createError({
            statusCode: 402,
            statusMessage: 'API quota exceeded. Please check your plan limits.'
          })
        }
        throw createError({
          statusCode: response.status,
          statusMessage: `Spoonacular API error: ${response.statusText}`
        })
      }

      const data: SpoonacularIngredient[] = await response.json()
      return data
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to search Spoonacular: ${error.message}`
      })
    }
  },
  {
    maxAge: 60 * 60 * 24, // 24 hours
    name: 'autocomplete',
    group: 'spoonacular',
    getKey: (event: any, query: string) => query.toLowerCase().trim()
  }
)

/**
 * Get ingredient information by ID
 * Uses cached function for performance
 */
export const getIngredientInfoCached = defineCachedFunction(
  async (event: any, ingredientId: number) => {
    const apiKey = getApiKey(event)
    const url = `${SPOONACULAR_API_BASE}/food/ingredients/${ingredientId}/information?amount=100&unit=g`
    
    try {
      const response = await fetch(url, {
        headers: {
          'x-api-key': apiKey
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw createError({
            statusCode: 404,
            statusMessage: 'Ingredient not found'
          })
        }
        if (response.status === 429) {
          throw createError({
            statusCode: 429,
            statusMessage: 'Rate limit exceeded. Please try again later.'
          })
        }
        if (response.status === 402) {
          throw createError({
            statusCode: 402,
            statusMessage: 'API quota exceeded. Please check your plan limits.'
          })
        }
        throw createError({
          statusCode: response.status,
          statusMessage: `Spoonacular API error: ${response.statusText}`
        })
      }

      const data: SpoonacularIngredientInfo = await response.json()
      return data
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to fetch ingredient from Spoonacular: ${error.message}`
      })
    }
  },
  {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    name: 'ingredientInfo',
    group: 'spoonacular',
    getKey: (event: any, ingredientId: number) => String(ingredientId)
  }
)

/**
 * Parse ingredients (batch processing)
 * Uses cached function for performance
 */
export const parseIngredientsCached = defineCachedFunction(
  async (event: any, ingredientStrings: string[]) => {
    const apiKey = getApiKey(event)
    
    // Spoonacular Parse Ingredients accepts ingredientList as newline-separated string
    const ingredientList = ingredientStrings.join('\n')
    const url = `${SPOONACULAR_API_BASE}/recipes/parseIngredients?apiKey=${apiKey}`
    
    try {
      const formData = new FormData()
      formData.append('ingredientList', ingredientList)
      formData.append('servings', '1')
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw createError({
            statusCode: 429,
            statusMessage: 'Rate limit exceeded. Please try again later.'
          })
        }
        if (response.status === 402) {
          throw createError({
            statusCode: 402,
            statusMessage: 'API quota exceeded. Please check your plan limits.'
          })
        }
        throw createError({
          statusCode: response.status,
          statusMessage: `Spoonacular API error: ${response.statusText}`
        })
      }

      const data: ParsedIngredient[] = await response.json()
      return data
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to parse ingredients: ${error.message}`
      })
    }
  },
  {
    maxAge: 60 * 60 * 24, // 24 hours
    name: 'parseIngredients',
    group: 'spoonacular',
    getKey: (event: any, ingredientStrings: string[]) => {
      // Create cache key from sorted ingredient strings
      return ingredientStrings.sort().join('|').toLowerCase()
    }
  }
)
