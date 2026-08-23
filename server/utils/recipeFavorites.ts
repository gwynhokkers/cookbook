import { and, count, desc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db, schema } from '../db'
import { viewRecipe } from '~~/shared/utils/abilities'
import { buildPaginatedResponse, parsePaginationQuery } from './pagination'
import { invalidateSearchCache } from './recipeSearchIndex'

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

export async function getFavoriteRecipeIds(userId: string) {
  try {
    const rows = await db.select({ recipeId: schema.recipeFavorites.recipeId })
      .from(schema.recipeFavorites)
      .where(eq(schema.recipeFavorites.userId, userId))

    return rows.map((row) => row.recipeId)
  } catch {
    // Production can hit this when migration 0003_recipe_favorites has not been applied.
    // Favourites are a search boost only — never fail the whole request/tool on this.
    return []
  }
}

export async function getFavoriteRecipesForUser(
  userId: string,
  query: Record<string, unknown>,
  defaultLimit = 6
) {
  const pagination = parsePaginationQuery(query, defaultLimit)
  if (!pagination) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pagination params required'
    })
  }

  const { page, pageSize, offset } = pagination

  const [{ total }] = await db.select({ total: count() })
    .from(schema.recipeFavorites)
    .innerJoin(schema.recipes, eq(schema.recipeFavorites.recipeId, schema.recipes.id))
    .where(eq(schema.recipeFavorites.userId, userId))

  const items = await db.select(recipeSummaryFields)
    .from(schema.recipeFavorites)
    .innerJoin(schema.recipes, eq(schema.recipeFavorites.recipeId, schema.recipes.id))
    .where(eq(schema.recipeFavorites.userId, userId))
    .orderBy(desc(schema.recipeFavorites.createdAt))
    .limit(pageSize)
    .offset(offset)

  return buildPaginatedResponse(items, Number(total), page, pageSize)
}

export async function assertRecipeCanBeFavorited(event: H3Event, recipeId: string) {
  const recipe = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  if (!recipe.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  await authorize(event, viewRecipe, recipe[0])
  return recipe[0]
}

export async function addFavorite(userId: string, recipeId: string) {
  await db.insert(schema.recipeFavorites)
    .values({ userId, recipeId })
    .onConflictDoNothing()

  await invalidateSearchCache()
}

export async function removeFavorite(userId: string, recipeId: string) {
  await db.delete(schema.recipeFavorites)
    .where(and(
      eq(schema.recipeFavorites.userId, userId),
      eq(schema.recipeFavorites.recipeId, recipeId)
    ))

  await invalidateSearchCache()
}

export async function isFavorite(userId: string, recipeId: string) {
  const rows = await db.select({ recipeId: schema.recipeFavorites.recipeId })
    .from(schema.recipeFavorites)
    .where(and(
      eq(schema.recipeFavorites.userId, userId),
      eq(schema.recipeFavorites.recipeId, recipeId)
    ))
    .limit(1)

  return rows.length > 0
}

export function buildFavoritesFingerprint(userId: string, favoriteIds: string[]) {
  return `${userId}:${[...favoriteIds].sort().join(',')}`
}
