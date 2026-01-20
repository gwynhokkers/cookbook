import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ingredient ID is required'
    })
  }

  const ingredient = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, id))
    .limit(1)

  if (!ingredient || ingredient.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ingredient not found'
    })
  }

  return ingredient[0]
})
