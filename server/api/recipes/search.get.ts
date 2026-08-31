import { viewAllRecipes } from '~~/shared/utils/abilities'
import { parseRecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'
import { getFavoriteRecipeIds, buildFavoritesFingerprint } from '../../utils/recipeFavorites'
import { queryRecipeSearch } from '../../utils/recipeSearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.limit) || 12, 1), 12)
  const scope = String(query.scope || 'all') === 'favorites' ? 'favorites' : 'all'
  const filters = parseRecipeSearchFilters(query as Record<string, unknown>)
  const canViewAll = await allows(event, viewAllRecipes)
  const searchQuery = q.length >= 2 ? q : ''

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

  return queryRecipeSearch({
    query: searchQuery,
    filters,
    page,
    pageSize,
    signedIn: canViewAll,
    scope,
    favoriteRecipeIds,
    favoritesFingerprint
  })
})
