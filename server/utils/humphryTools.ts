import type { H3Event } from 'h3'
import { tool } from 'ai'
import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '../db'
import { viewRecipe } from '~~/shared/utils/abilities'
import { getFavoriteRecipeIds } from './recipeFavorites'
import { searchRecipes } from './recipeSearch'
import type { HumphryRecipeSummary } from '~~/shared/utils/humphryTypes'
import {
  formatShoppingListCopyText,
  generateShoppingList,
  getOrCreateShoppingList,
  isValidListDate,
  setShoppingListRecipes
} from './shoppingLists'

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

function localTodayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveListDate(date?: string | null) {
  if (!date) {
    return localTodayIso()
  }
  if (!isValidListDate(date)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid date. Use YYYY-MM-DD.'
    })
  }
  return date
}

async function loadRecipeDetails(recipeId: string, event: H3Event) {
  const rows = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  if (!rows.length) {
    return { error: 'Recipe not found', recipes: [] as HumphryRecipeSummary[] }
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
  const summary = toSummary({
    id: rows[0].id,
    title: rows[0].title,
    description: rows[0].description,
    imageUrl: rows[0].imageUrl,
    tags: rows[0].tags
  })

  return {
    recipes: [summary],
    source: rows[0].source,
    stepCount: steps.length,
    ingredients: ingredients.map(row => ({
      name: row.name,
      amount: row.amount,
      unit: row.unit
    }))
  }
}

function toRecipeCards(recipes: Array<{
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  tags?: string[] | null
}>): HumphryRecipeSummary[] {
  return recipes.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    tags: row.tags || []
  }))
}

export function createHumphryTools(event: H3Event, userId: string) {
  return {
    search_recipes: tool({
      description: 'Search the Humboldt Kitchen cookbook by keywords, ingredients, tags, or recipe names.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Search terms such as ingredients, dish type, or recipe name'),
        limit: z.coerce.number().int().min(1).max(15).optional().describe('Maximum number of results (default 8)')
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
          recipes: results.map(result => ({
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
        limit: z.coerce.number().int().min(1).max(20).optional().describe('Maximum number of favourites to return (default 10)')
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
    }),

    get_shopping_list: tool({
      description: 'Get the user shopping list for a date (default today), including recipes and aisle-grouped items.',
      inputSchema: z.object({
        date: z.string().optional().describe('Local calendar date YYYY-MM-DD (defaults to today)')
      }),
      execute: async ({ date }) => {
        const listDate = resolveListDate(date)
        const list = await getOrCreateShoppingList(userId, listDate)
        return {
          listDate: list.listDate,
          status: list.status,
          pageUrl: `/shopping-list?date=${list.listDate}`,
          recipes: toRecipeCards(list.recipes),
          itemCount: list.items.length,
          items: list.items.map(item => ({
            name: item.name,
            displayAmount: item.displayAmount,
            aisle: item.aisle,
            packageSuggestion: item.packageSuggestion,
            substitutionNote: item.substitutionNote,
            needsReview: item.needsReview,
            checked: item.checked
          })),
          copyText: formatShoppingListCopyText(list)
        }
      }
    }),

    set_shopping_list_recipes: tool({
      description: 'Add or replace recipes on the shopping list for a date. Use mode=add to append, replace to set exactly.',
      inputSchema: z.object({
        recipeIds: z.array(z.string().min(1)).min(1).max(30),
        date: z.string().optional().describe('Local calendar date YYYY-MM-DD (defaults to today)'),
        mode: z.enum(['add', 'replace']).optional().describe('add (default) or replace')
      }),
      execute: async ({ recipeIds, date, mode }) => {
        const listDate = resolveListDate(date)
        const list = await getOrCreateShoppingList(userId, listDate)
        const updated = await setShoppingListRecipes(
          event,
          list.id,
          userId,
          recipeIds,
          mode === 'replace' ? 'replace' : 'add'
        )
        return {
          listDate: updated.listDate,
          pageUrl: `/shopping-list?date=${updated.listDate}`,
          recipes: toRecipeCards(updated.recipes),
          status: updated.status
        }
      }
    }),

    generate_shopping_list: tool({
      description: 'Amalgamate ingredients for the shopping list recipes and enrich with aisle/package/substitution suggestions.',
      inputSchema: z.object({
        date: z.string().optional().describe('Local calendar date YYYY-MM-DD (defaults to today)')
      }),
      execute: async ({ date }) => {
        const listDate = resolveListDate(date)
        const list = await getOrCreateShoppingList(userId, listDate)
        const generated = await generateShoppingList(event, list.id, userId)

        const byAisle = new Map<string, Array<{ name: string, displayAmount: string, packageSuggestion: string | null }>>()
        for (const item of generated.items) {
          const aisle = item.aisle || 'Other'
          const bucket = byAisle.get(aisle) || []
          bucket.push({
            name: item.name,
            displayAmount: item.displayAmount,
            packageSuggestion: item.packageSuggestion
          })
          byAisle.set(aisle, bucket)
        }

        return {
          listDate: generated.listDate,
          status: generated.status,
          warning: generated.warning || null,
          pageUrl: `/shopping-list?date=${generated.listDate}`,
          // Card envelope: full recipe summaries. Titles alone are not cardable.
          recipes: toRecipeCards(generated.recipes),
          aisles: [...byAisle.entries()].map(([aisle, items]) => ({ aisle, items })),
          copyText: formatShoppingListCopyText(generated)
        }
      }
    })
  }
}
