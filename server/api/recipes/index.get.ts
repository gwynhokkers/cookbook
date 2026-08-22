import { count, desc, eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { viewAllRecipes } from '~~/shared/utils/abilities'
import { buildPaginatedResponse, parsePaginationQuery } from '../../utils/pagination'

const recipeSummaryFields = {
  id: schema.recipes.id,
  title: schema.recipes.title,
  description: schema.recipes.description,
  imageUrl: schema.recipes.imageUrl,
  date: schema.recipes.date,
  tags: schema.recipes.tags,
  source: schema.recipes.source,
  visibility: schema.recipes.visibility
}

export default defineEventHandler(async (event) => {
  const canViewAll = await allows(event, viewAllRecipes)
  const query = getQuery(event)
  const pagination = parsePaginationQuery(query, 9)

  const visibilityFilter = canViewAll ? undefined : eq(schema.recipes.visibility, 'public')

  if (pagination) {
    const { page, pageSize, offset } = pagination

    const countQuery = db.select({ total: count() }).from(schema.recipes)
    const [{ total }] = visibilityFilter
      ? await countQuery.where(visibilityFilter)
      : await countQuery

    const itemsQuery = db.select(recipeSummaryFields)
      .from(schema.recipes)
      .orderBy(desc(schema.recipes.date))
      .limit(pageSize)
      .offset(offset)

    const items = visibilityFilter
      ? await itemsQuery.where(visibilityFilter)
      : await itemsQuery

    return buildPaginatedResponse(items, Number(total), page, pageSize)
  }

  const listQuery = db.select(recipeSummaryFields)
    .from(schema.recipes)
    .orderBy(desc(schema.recipes.date))

  if (visibilityFilter) {
    return listQuery.where(visibilityFilter)
  }

  return listQuery
})
