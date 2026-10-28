import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { CookbookDb } from './types'

export async function getFavoriteRecipeIds(db: CookbookDb, userId: string) {
  try {
    const rows = await db.select({ recipeId: schema.recipeFavorites.recipeId })
      .from(schema.recipeFavorites)
      .where(eq(schema.recipeFavorites.userId, userId))

    return rows.map((row) => row.recipeId)
  } catch {
    // Production can hit this when migration 0003_recipe_favorites has not been applied.
    // Favourites are a search boost only — never fail the whole request/tool on this.
    return []
  }
}
