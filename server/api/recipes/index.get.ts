import { db, schema } from '../../db'
import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const recipes = await db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    description: schema.recipes.description,
    imageUrl: schema.recipes.imageUrl,
    date: schema.recipes.date,
    tags: schema.recipes.tags,
    source: schema.recipes.source
  })
    .from(schema.recipes)
    .orderBy(desc(schema.recipes.date))

  return recipes
})
