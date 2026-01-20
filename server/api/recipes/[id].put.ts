import { db, schema } from '../../db'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  // Check if recipe exists and user owns it
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

  // Check ownership - allow editing if user owns the recipe OR if recipe has no author (migrated recipes)
  if (existing[0].authorId !== null && existing[0].authorId !== session.user.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: You can only edit your own recipes'
    })
  }

  const { title, description, imageUrl, date, tags, source, steps } = body

  const updateData: any = {
    updatedAt: new Date()
  }
  
  // If recipe has no author, assign it to the current user on first edit
  if (existing[0].authorId === null) {
    updateData.authorId = session.user.id
  }

  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl
  if (date !== undefined) updateData.date = new Date(date)
  if (tags !== undefined) updateData.tags = tags
  if (source !== undefined) updateData.source = source
  if (steps !== undefined) updateData.steps = steps

  await db.update(schema.recipes)
    .set(updateData)
    .where(eq(schema.recipes.id, id))

  const updated = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  return updated[0]
})
