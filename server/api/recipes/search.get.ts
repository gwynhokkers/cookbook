import { parseRecipeSearchFilters } from '~~/shared/utils/recipeSearchFilters'
import { db } from '../../db'
import { searchRecipes } from '../../domain/recipes/search'
import { getViewer } from '../../utils/viewer'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.limit) || 12, 1), 12)
  const scope = String(query.scope || 'all') === 'favorites' ? 'favorites' : 'all'
  const filters = parseRecipeSearchFilters(query as Record<string, unknown>)
  const viewer = await getViewer(event)

  if (scope === 'favorites' && !viewer) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required to search favourites'
    })
  }

  return searchRecipes(db, viewer, {
    query: q.length >= 2 ? q : '',
    filters,
    page,
    pageSize,
    scope
  })
})
