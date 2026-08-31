import { eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { collectDistinctSources } from '../../utils/recipeFacets'

export default defineEventHandler(async (event) => {
  const canViewAll = await allows(event, viewAllRecipes)
  const q = String(getQuery(event).q || '')

  let query = db.select({ source: schema.recipes.source }).from(schema.recipes)
  if (!canViewAll) {
    query = query.where(eq(schema.recipes.visibility, 'public'))
  }

  const rows = await query
  return { sources: collectDistinctSources(rows, q) }
})
