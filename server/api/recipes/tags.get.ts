import { eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { collectDistinctTags } from '../../utils/recipeFacets'

export default defineEventHandler(async (event) => {
  const canViewAll = await allows(event, viewAllRecipes)
  const q = String(getQuery(event).q || '')

  let query = db.select({ tags: schema.recipes.tags }).from(schema.recipes)
  if (!canViewAll) {
    query = query.where(eq(schema.recipes.visibility, 'public'))
  }

  const rows = await query
  return { tags: collectDistinctTags(rows, q) }
})
