import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '../../../db'
import { viewAllRecipes, viewRecipe } from '~~/shared/utils/abilities'

const recipeSummaryFields = {
  id: schema.recipes.id,
  title: schema.recipes.title,
  tags: schema.recipes.tags,
  date: schema.recipes.date,
  visibility: schema.recipes.visibility
}

function normalizeTags(tags: string[] | null | undefined) {
  return (tags || [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 20)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const [recipe] = await db.select({
    id: schema.recipes.id,
    tags: schema.recipes.tags,
    visibility: schema.recipes.visibility
  })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, id))
    .limit(1)

  if (!recipe) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  await authorize(event, viewRecipe, recipe)

  const canViewAll = await allows(event, viewAllRecipes)
  const visibilityFilter = canViewAll ? undefined : eq(schema.recipes.visibility, 'public')
  const excludeCurrent = ne(schema.recipes.id, id)

  const candidatesQuery = db.select(recipeSummaryFields)
    .from(schema.recipes)
    .where(visibilityFilter ? and(excludeCurrent, visibilityFilter) : excludeCurrent)
    .orderBy(desc(schema.recipes.date))

  const candidates = await candidatesQuery

  const currentTags = new Set(normalizeTags(recipe.tags))

  const scored = candidates.map((candidate) => {
    const candidateTags = normalizeTags(candidate.tags)
    const overlap = candidateTags.filter((tag) => currentTags.has(tag)).length
    return { ...candidate, overlap }
  })

  const withOverlap = scored.filter((candidate) => candidate.overlap > 0)
  const pool = withOverlap.length > 0 ? withOverlap : scored

  pool.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    const aTime = a.date ? new Date(a.date).getTime() : 0
    const bTime = b.date ? new Date(b.date).getTime() : 0
    return bTime - aTime
  })

  return pool.slice(0, limit).map(({ id: recipeId, title }) => ({
    id: recipeId,
    title
  }))
})
