import { defineSitemapEventHandler } from '#imports'
import { db, schema } from '../../db'
import { loadPublicRecipeSitemapUrls } from '../../utils/recipeSitemap'

export default defineSitemapEventHandler(async () => {
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
