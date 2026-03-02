import { db, schema } from '../../../../db'
import { eq, and } from 'drizzle-orm'
import { editRecipe } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, editRecipe)
  const recipeId = getRouterParam(event, 'id')
  const ingredientId = getRouterParam(event, 'ingredientId')

  if (!recipeId || !ingredientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID and Ingredient ID are required'
    })
  }

  await db.delete(schema.recipeIngredients)
    .where(and(
      eq(schema.recipeIngredients.recipeId, recipeId),
      eq(schema.recipeIngredients.id, ingredientId)
    ))

  return { success: true }
})
