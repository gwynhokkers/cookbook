import { db, schema } from '../db'

export default eventHandler(async (event) => {
  // Db should be initialized by plugin, but check if it's ready
  if (!db || typeof db.select !== 'function') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Database not initialized'
    })
  }
  
  const recipes = await db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    description: schema.recipes.description,
    tags: schema.recipes.tags
  })
    .from(schema.recipes)

  // Format for search (similar to NuxtContent format)
  return recipes.map(recipe => ({
    path: `/recipes/${recipe.id}`,
    title: recipe.title,
    description: recipe.description,
    tags: recipe.tags,
    // Create searchable text
    content: `${recipe.title} ${recipe.description || ''} ${(recipe.tags || []).join(' ')}`
  }))
})
