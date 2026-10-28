import { eq } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from '../../db/schema'

export type CookbookDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>

/** The signed-in user a query runs for, or `null` for a guest. */
export type Viewer = { id: string } | null

// Keep in step with viewRecipe and viewAllRecipes in shared/utils/abilities.ts: guests see public recipes, signed-in users see all.
/** A `where` condition limiting `recipes` to the ones the viewer can see; `undefined` means no limit. */
export function visibleTo(viewer: Viewer) {
  return viewer ? undefined : eq(schema.recipes.visibility, 'public')
}
