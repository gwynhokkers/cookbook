import { db, schema } from '../../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const servings = Number(getQuery(event).servings) || 1

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  // Fetch recipe ingredients with ingredient data
  const recipeIngredients = await db
    .select({
      id: schema.recipeIngredients.id,
      ingredientId: schema.recipeIngredients.ingredientId,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      ingredient: {
        id: schema.ingredients.id,
        name: schema.ingredients.name,
        spoonacularIngredientId: schema.ingredients.spoonacularIngredientId,
        spoonacularData: schema.ingredients.spoonacularData
      }
    })
    .from(schema.recipeIngredients)
    .leftJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeId, id))

  // Prepare nutrition data
  const ingredientsWithNutrition = recipeIngredients.map(ri => {
    let nutritionPer100g = null
    
    if (ri.ingredient?.spoonacularData) {
      nutritionPer100g = extractNutrition(ri.ingredient.spoonacularData as any)
    }

    return {
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredient?.name || 'Unknown',
      amount: parseFloat(ri.amount) || 0,
      unit: ri.unit,
      nutritionPer100g
    }
  })

  // Calculate aggregated nutrition
  const nutrition = aggregateNutrition(ingredientsWithNutrition, servings)

  return nutrition
})
