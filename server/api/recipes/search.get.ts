import { viewAllRecipes } from '~~/shared/utils/abilities'
import { searchRecipes } from '../../utils/recipeSearch'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const limit = Number(query.limit || 20)
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

  return searchRecipes({
    query: q,
    limit: Number.isFinite(limit) ? limit : 20,
    signedIn: canViewAll
  })
})
