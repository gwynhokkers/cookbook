import { viewAllRecipes } from '~~/shared/utils/abilities'
import { getFavoriteRecipeIds, buildFavoritesFingerprint } from '../../utils/recipeFavorites'
import { searchRecipes } from '../../utils/recipeSearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const limit = Number(query.limit || 20)
  const scope = String(query.scope || 'all') === 'favorites' ? 'favorites' : 'all'
  const canViewAll = await allows(event, viewAllRecipes)

  if (!q) {
    return []
  }

  if (q.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Search query must be at least 2 characters'
    })
  }

  if (scope === 'favorites' && !canViewAll) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required to search favourites'
    })
  }

  let favoriteRecipeIds: string[] = []
  let favoritesFingerprint = 'none'

  if (canViewAll) {
    const session = await getUserSession(event)
    const userId = (session.user as Record<string, unknown> | undefined)?.id as string | undefined
    if (userId) {
      favoriteRecipeIds = await getFavoriteRecipeIds(userId)
      favoritesFingerprint = buildFavoritesFingerprint(userId, favoriteRecipeIds)
    }
  }

  return searchRecipes({
    query: q,
    limit: Number.isFinite(limit) ? limit : 20,
    signedIn: canViewAll,
    scope,
    favoriteRecipeIds,
    favoritesFingerprint
  })
})
