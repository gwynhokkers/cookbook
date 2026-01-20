import { db, schema } from '../../../db'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const recipeIngredients = await db
    .select({
      id: schema.recipeIngredients.id,
      recipeId: schema.recipeIngredients.recipeId,
      ingredientId: schema.recipeIngredients.ingredientId,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      notes: schema.recipeIngredients.notes,
      order: schema.recipeIngredients.order,
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
    .orderBy(sql`CAST(${schema.recipeIngredients.order} AS INTEGER)`)

  return recipeIngredients
})
