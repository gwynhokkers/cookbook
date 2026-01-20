import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ingredient ID is required'
    })
  }

  const { name, spoonacularIngredientId, spoonacularData } = body

  const updateData: any = {
    updatedAt: new Date()
  }

  if (name !== undefined) updateData.name = name
  if (spoonacularIngredientId !== undefined) updateData.spoonacularIngredientId = spoonacularIngredientId ? String(spoonacularIngredientId) : null
  if (spoonacularData !== undefined) updateData.spoonacularData = spoonacularData

  await db.update(schema.ingredients)
    .set(updateData)
    .where(eq(schema.ingredients.id, id))

  const updated = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, id))
    .limit(1)

  return updated[0]
})
