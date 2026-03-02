import { db, schema } from '../../db'
import { nanoid } from 'nanoid'
import { createRecipe } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  const session = await requireUserSession(event)
  const body = await readBody(event)

  const { title, description, imageUrl, date, tags, source, steps, visibility } = body

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  const recipeId = nanoid()
  const now = new Date()

  const newRecipe = {
    id: recipeId,
    title,
    description: description || null,
    imageUrl: imageUrl || null,
    date: date ? new Date(date) : now,
    tags: tags || [],
    source: source || null,
    steps: steps || [],
    visibility: visibility === 'private' ? 'private' : 'public',
    authorId: (session.user as Record<string, unknown>).id as string,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(schema.recipes).values(newRecipe)

  return newRecipe
})
