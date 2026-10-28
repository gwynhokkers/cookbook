import { count, desc } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { buildPaginatedResponse } from '../../utils/pagination'
import { visibleTo, type CookbookDb, type Viewer } from './types'

const recipeSummaryFields = {
  id: schema.recipes.id,
  title: schema.recipes.title,
  description: schema.recipes.description,
  imageUrl: schema.recipes.imageUrl,
  date: schema.recipes.date,
  tags: schema.recipes.tags,
  source: schema.recipes.source,
  sourceUrl: schema.recipes.sourceUrl,
  visibility: schema.recipes.visibility,
  estimatedMinutes: schema.recipes.estimatedMinutes
}

export interface RecipePageRequest {
  page: number
  pageSize: number
  offset: number
}

/** Recipe summaries the viewer can see, newest first: one page when `pagination` is given, otherwise all of them. */
export async function listRecipes(db: CookbookDb, viewer: Viewer, pagination: RecipePageRequest | null) {
  const visibilityFilter = visibleTo(viewer)

  if (pagination) {
    const { page, pageSize, offset } = pagination

    const [counted] = await db.select({ total: count() })
      .from(schema.recipes)
      .where(visibilityFilter)
    const total = counted?.total ?? 0

    const items = await db.select(recipeSummaryFields)
      .from(schema.recipes)
      .where(visibilityFilter)
      .orderBy(desc(schema.recipes.date))
      .limit(pageSize)
      .offset(offset)

    return buildPaginatedResponse(items, Number(total), page, pageSize)
  }

  return db.select(recipeSummaryFields)
    .from(schema.recipes)
    .where(visibilityFilter)
    .orderBy(desc(schema.recipes.date))
}
