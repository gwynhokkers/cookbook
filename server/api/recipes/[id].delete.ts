import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const existing = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  if (!existing || existing.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  if (existing[0].imageUrl) {
    try {
      // @ts-ignore - hub:blob is a virtual import resolved by Nitro
      const { blob } = await import('hub:blob')
      await blob.delete(existing[0].imageUrl)
    } catch (error) {
      console.error('Failed to delete image:', error)
    }
  }

  await db.delete(schema.recipes)
    .where(eq(schema.recipes.id, id))

  return { success: true }
})
