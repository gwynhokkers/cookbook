import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    recipes: defineCollection({
      source: 'recipes/*.md',
      type: 'page',
      // Define custom schema for docs collection
      schema: z.object({
        image: z.string(),
        date: z.date(),
        tags: z.array(z.string()),
        source: z.string()
      })
    })
  }
})
