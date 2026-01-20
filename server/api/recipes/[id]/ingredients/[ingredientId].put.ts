import { db, schema } from '../../../../db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const recipeId = getRouterParam(event, 'id')
  const ingredientId = getRouterParam(event, 'ingredientId')
  const body = await readBody(event)

  if (!recipeId || !ingredientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID and Ingredient ID are required'
    })
  }

  const { amount, unit, notes, order } = body

  const updateData: any = {
    updatedAt: new Date()
  }

  if (amount !== undefined) updateData.amount = String(amount)
  if (unit !== undefined) updateData.unit = unit
  if (notes !== undefined) updateData.notes = notes || null
  if (order !== undefined) updateData.order = String(order)

  await db.update(schema.recipeIngredients)
    .set(updateData)
    .where(and(
      eq(schema.recipeIngredients.recipeId, recipeId),
      eq(schema.recipeIngredients.id, ingredientId)
    ))

  const updated = await db
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
    .where(and(
      eq(schema.recipeIngredients.recipeId, recipeId),
      eq(schema.recipeIngredients.id, ingredientId)
    ))
    .limit(1)

  return updated[0]
})
