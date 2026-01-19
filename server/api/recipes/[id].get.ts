import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const recipe = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  if (!recipe || recipe.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  return recipe[0]
})
