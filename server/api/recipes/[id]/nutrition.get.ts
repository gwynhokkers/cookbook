import { db, schema } from '../../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const queryServings = getQuery(event).servings
  const queryServingsNumber = queryServings !== undefined && queryServings !== ''
    ? Number(queryServings)
    : undefined

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const recipeRows = await db
    .select({ servings: schema.recipes.servings })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  if (!recipeRows.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  const recipeServings = recipeRows[0].servings
  const effectiveServings = (queryServingsNumber && queryServingsNumber > 0)
    ? Math.floor(queryServingsNumber)
    : (recipeServings && recipeServings > 0 ? recipeServings : 1)

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

  // Prepare nutrition data. Pass the raw Spoonacular data through so the calculator can
  // tell parse-derived (absolute) nutrition from per-100g info data.
  const ingredientsWithNutrition = recipeIngredients.map(ri => ({
    ingredientId: ri.ingredientId,
    ingredientName: ri.ingredient?.name || 'Unknown',
    amount: parseFloat(ri.amount) || 0,
    unit: ri.unit,
    spoonacularData: ri.ingredient?.spoonacularData || null
  }))

  // Calculate aggregated nutrition
  const nutrition = aggregateNutrition(ingredientsWithNutrition, effectiveServings)

  return nutrition
})
