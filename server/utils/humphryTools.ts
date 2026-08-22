import type { H3Event } from 'h3'
import { tool } from 'ai'
import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db'
import { viewRecipe } from '~~/shared/utils/abilities'
import { getFavoriteRecipeIds } from './recipeFavorites'
import { searchRecipes } from './recipeSearch'
import type { HumphryRecipeSummary } from '~~/shared/utils/humphryTypes'

const recipeSummaryFields = {
  id: schema.recipes.id,
  title: schema.recipes.title,
  description: schema.recipes.description,
  imageUrl: schema.recipes.imageUrl,
  tags: schema.recipes.tags
}

function toSummary(row: {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  tags: string[] | null
}): HumphryRecipeSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    tags: row.tags || []
  }
}

async function loadRecipeDetails(recipeId: string, event: H3Event) {
  const rows = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  if (!rows.length) {
    return { error: 'Recipe not found' }
  }

  await authorize(event, viewRecipe, rows[0])

  const ingredients = await db.select({
    name: schema.ingredients.name,
    amount: schema.recipeIngredients.amount,
    unit: schema.recipeIngredients.unit
  })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.recipeId, recipeId))
    .orderBy(sql`CAST(${schema.recipeIngredients.order} AS INTEGER)`)

  const steps = rows[0].steps || []

  return {
    id: rows[0].id,
    title: rows[0].title,
    description: rows[0].description,
    tags: rows[0].tags || [],
    source: rows[0].source,
    stepCount: steps.length,
    ingredients: ingredients.map((row) => ({
      name: row.name,
      amount: row.amount,
      unit: row.unit
    }))
  }
}

export function createHumphryTools(event: H3Event, userId: string) {
  return {
    search_recipes: tool({
      description: 'Search the Humboldt Kitchen cookbook by keywords, ingredients, tags, or recipe names.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Search terms such as ingredients, dish type, or recipe name'),
        limit: z.number().int().min(1).max(15).optional().describe('Maximum number of results (default 8)')
      }),
      execute: async ({ query, limit }) => {
        const favoriteRecipeIds = await getFavoriteRecipeIds(userId)
        const results = await searchRecipes({
          query,
          limit: limit ?? 8,
          signedIn: true,
          favoriteRecipeIds
        })

        return {
          recipes: results.map((result) => ({
            id: result.id,
            title: result.title,
            description: result.description,
            imageUrl: result.imageUrl,
            tags: result.tags,
            matchedOn: result.matchedOn
          }))
        }
      }
    }),

    get_recipe_details: tool({
      description: 'Get compact details for a specific recipe by id, including ingredients and step count.',
      inputSchema: z.object({
        recipeId: z.string().min(1).describe('The recipe id from search results')
      }),
      execute: async ({ recipeId }) => loadRecipeDetails(recipeId, event)
    }),

    list_favorites: tool({
      description: 'List recipes the user has marked as favourites.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().describe('Maximum number of favourites to return (default 10)')
      }),
      execute: async ({ limit }) => {
        const favoriteIds = await getFavoriteRecipeIds(userId)
        const capped = favoriteIds.slice(0, limit ?? 10)

        if (!capped.length) {
          return { recipes: [] as HumphryRecipeSummary[] }
        }

        const rows = await db.select(recipeSummaryFields)
          .from(schema.recipes)
          .where(inArray(schema.recipes.id, capped))

        const order = new Map(capped.map((id, index) => [id, index]))
        const sorted = [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

        return {
          recipes: sorted.map(toSummary)
        }
      }
    })
  }
}
