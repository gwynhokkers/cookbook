import { db, schema } from '../../db'
import { loadPublicRecipeSitemapUrls } from '../../utils/recipeSitemap'

export default defineEventHandler(async () => {
  return loadPublicRecipeSitemapUrls(() => {
    return db
      .select({
        id: schema.recipes.id,
        visibility: schema.recipes.visibility,
        updatedAt: schema.recipes.updatedAt
      })
      .from(schema.recipes)
  })
})
