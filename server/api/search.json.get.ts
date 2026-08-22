import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { viewAllRecipes } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  if (!db || typeof db.select !== 'function') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Database not initialized'
    })
  }

  const canViewAll = await allows(event, viewAllRecipes)

  const recipeQuery = db.select({
    id: schema.recipes.id,
    title: schema.recipes.title,
    description: schema.recipes.description,
    tags: schema.recipes.tags,
    source: schema.recipes.source,
    visibility: schema.recipes.visibility
  }).from(schema.recipes)

  const recipes = canViewAll
    ? await recipeQuery
    : await recipeQuery.where(eq(schema.recipes.visibility, 'public'))

  return recipes.map((recipe) => ({
    path: `/recipes/${recipe.id}`,
    title: recipe.title,
    description: recipe.description,
    tags: recipe.tags,
    source: recipe.source,
    content: `${recipe.title} ${recipe.description || ''} ${(recipe.tags || []).join(' ')} ${recipe.source || ''}`
  }))
})
