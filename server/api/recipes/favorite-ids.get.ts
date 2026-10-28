import { db } from '../../db'
import { getFavoriteRecipeIds } from '../../domain/recipes/favorites'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = (session.user as Record<string, unknown>).id as string

  const ids = await getFavoriteRecipeIds(db, userId)
  return { ids }
})
