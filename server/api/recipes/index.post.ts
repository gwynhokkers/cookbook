import { db, schema } from '../../db'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const body = await readBody(event)

  const { title, description, imageUrl, date, tags, source, steps } = body

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
    authorId: session.user.id,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(schema.recipes).values(newRecipe)

  return newRecipe
})
