import { db, schema } from '../../db'
import { eq } from 'drizzle-orm'
import { editRecipe } from '~~/shared/utils/abilities'
import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'

export default defineEventHandler(async (event) => {
  await authorize(event, editRecipe)
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

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

  const { title, description, imageUrl, date, tags, source, steps, visibility } = body

  const updateData: Record<string, unknown> = {
    updatedAt: new Date()
  }

  if (existing[0].authorId === null) {
    updateData.authorId = (session.user as Record<string, unknown>).id
  }

  if (title !== undefined) updateData.title = toRecipeTitleCase(String(title).trim())
  if (description !== undefined) updateData.description = description
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl
  if (date !== undefined) updateData.date = new Date(date)
  if (tags !== undefined) updateData.tags = tags
  if (source !== undefined) updateData.source = source
  if (steps !== undefined) updateData.steps = steps
  if (visibility !== undefined) updateData.visibility = visibility === 'private' ? 'private' : 'public'

  await db.update(schema.recipes)
    .set(updateData)
    .where(eq(schema.recipes.id, id))

  const updated = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  return updated[0]
})
