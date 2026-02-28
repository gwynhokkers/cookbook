import { db, schema } from '../../db'
import { desc, eq } from 'drizzle-orm'
import { viewAllRecipes } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const canViewAll = await allows(event, viewAllRecipes)

  const query = db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    description: schema.recipes.description,
    imageUrl: schema.recipes.imageUrl,
    date: schema.recipes.date,
    tags: schema.recipes.tags,
    source: schema.recipes.source,
    visibility: schema.recipes.visibility
  })
    .from(schema.recipes)
    .orderBy(desc(schema.recipes.date))

  if (!canViewAll) {
    return query.where(eq(schema.recipes.visibility, 'public'))
  }

  return query
})
