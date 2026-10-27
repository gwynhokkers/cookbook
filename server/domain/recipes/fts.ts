import { sql } from 'drizzle-orm'
import type { CookbookDb } from './types'

const ftsAvailable = new WeakMap<CookbookDb, boolean>()

/** Whether the recipes_fts table exists. Cached per database handle. */
export async function isRecipeFtsAvailable(db: CookbookDb): Promise<boolean> {
  const cached = ftsAvailable.get(db)
  if (cached !== undefined) return cached
  let available: boolean
  try {
    await db.run(sql`SELECT 1 FROM recipes_fts LIMIT 1`)
    available = true
  } catch {
    available = false
  }
  ftsAvailable.set(db, available)
  return available
}
