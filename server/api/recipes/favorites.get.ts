import { getFavoriteRecipesForUser } from '../../utils/recipeFavorites'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = (session.user as Record<string, unknown>).id as string

  return getFavoriteRecipesForUser(userId, getQuery(event), 6)
})
