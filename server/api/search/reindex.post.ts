import { rebuildRecipeSearchIndex } from '../../utils/recipeSearchIndex'

export default defineEventHandler(async (event) => {
  const authHeader = event.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET || 'migration-secret'}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const offset = query.offset != null ? Number(query.offset) : 0
  // Omit limit for a full rebuild via bulk SQL (fast; avoids Cloudflare 524).
  // Pass ?limit=25&offset=0 for batched per-recipe indexing (parsed book/author).
  const limit = query.limit != null ? Number(query.limit) : undefined

  return rebuildRecipeSearchIndex({
    offset: Number.isFinite(offset) ? offset : 0,
    limit: limit != null && Number.isFinite(limit) ? limit : undefined
  })
})
