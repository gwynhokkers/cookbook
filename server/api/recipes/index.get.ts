import { db, schema } from '../../db'
import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getOptionalSession(event)
  const isSignedIn = !!session?.user

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

  if (!isSignedIn) {
    return query.where(eq(schema.recipes.visibility, 'public'))
  }

  return query
})
