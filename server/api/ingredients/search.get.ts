import { db, schema } from '../../db'
import { ilike, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event).q as string

  if (!query || query.trim().length < 1) {
    return []
  }

  const searchTerm = `%${query.trim()}%`

  const results = await db
    .select()
    .from(schema.ingredients)
    .where(ilike(schema.ingredients.name, searchTerm))
    .limit(20)

  return results
})
